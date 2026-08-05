#![cfg(target_os = "linux")]

use std::cell::RefCell;
use std::ffi::{c_void, CString};
use std::os::raw::{c_char, c_int};
use std::ptr::NonNull;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use gtk::gdk;
use gtk::glib;
use gtk::glib::translate::{Stash, ToGlibPtr};
use gtk::prelude::*;
use libmpv2::render::{OpenGLInitParams, RenderContext, RenderParam, RenderParamApiType};
use libmpv2_sys::mpv_handle;

const GL_FRAMEBUFFER_BINDING: u32 = 0x8CA6;
const GL_FRAMEBUFFER: u32 = 0x8D40;
const GL_COLOR_ATTACHMENT0: u32 = 0x8CE0;
const GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: u32 = 0x8CD0;
const GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: u32 = 0x8CD1;
const GL_RENDERBUFFER: u32 = 0x8D41;
const GL_RENDERBUFFER_WIDTH: u32 = 0x8D42;
const GL_RENDERBUFFER_HEIGHT: u32 = 0x8D43;
const RTLD_DEFAULT: *mut c_void = std::ptr::null_mut();

extern "C" {
    fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
    fn gdk_x11_display_get_xdisplay(display: *mut c_void) -> *mut c_void;
    fn gdk_wayland_display_get_wl_display(display: *mut c_void) -> *mut c_void;
}

#[derive(Copy, Clone, PartialEq)]
enum Backend {
    X11,
    Wayland,
}

#[derive(Copy, Clone)]
struct MpvHandlePtr(NonNull<mpv_handle>);
unsafe impl Send for MpvHandlePtr {}

struct Pending {
    mpv: MpvHandlePtr,
    backend: Backend,
    display_native: u64,
}

struct Embed {
    area: gtk::GLArea,
    overlay: gtk::Overlay,
    gtk_window: gtk::ApplicationWindow,
    vbox: gtk::Box,
    web_view: gtk::Widget,
}

unsafe impl Send for Embed {}
unsafe impl Sync for Embed {}

static EMBED: OnceLock<Mutex<Option<Embed>>> = OnceLock::new();
static PENDING: OnceLock<Mutex<Option<Pending>>> = OnceLock::new();
static REDRAW_PENDING: AtomicBool = AtomicBool::new(false);
static LAST_SURFACE: AtomicU64 = AtomicU64::new(0);
static PROC_WAYLAND: AtomicBool = AtomicBool::new(false);
static FBO_ZERO_WARNED: AtomicBool = AtomicBool::new(false);

fn embed_slot() -> &'static Mutex<Option<Embed>> {
    EMBED.get_or_init(|| Mutex::new(None))
}

fn pending_slot() -> &'static Mutex<Option<Pending>> {
    PENDING.get_or_init(|| Mutex::new(None))
}

type GlProcLoader = unsafe extern "C" fn(*const c_char) -> *mut c_void;

fn symbol_as_loader(name: &[u8]) -> Option<GlProcLoader> {
    let sym = unsafe { dlsym(RTLD_DEFAULT, name.as_ptr() as *const c_char) };
    (!sym.is_null()).then(|| unsafe { std::mem::transmute(sym) })
}

fn proc_loader() -> Option<unsafe extern "C" fn(*const c_char) -> *mut c_void> {
    if let Some(epoxy) = symbol_as_loader(b"epoxy_get_proc_address\0") {
        return Some(epoxy);
    }
    let primary = if PROC_WAYLAND.load(Ordering::Relaxed) {
        b"eglGetProcAddress\0".as_ptr()
    } else {
        b"glXGetProcAddressARB\0".as_ptr()
    };
    let sym = unsafe { dlsym(RTLD_DEFAULT, primary as *const c_char) };
    if !sym.is_null() {
        return Some(unsafe { std::mem::transmute(sym) });
    }
    let egl = unsafe { dlsym(RTLD_DEFAULT, b"eglGetProcAddress\0".as_ptr() as *const c_char) };
    if egl.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute(egl) })
}

fn get_proc_address(_ctx: &(), name: &str) -> *mut c_void {
    let cstr = match CString::new(name) {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };
    if let Some(f) = proc_loader() {
        let p = unsafe { f(cstr.as_ptr()) };
        if !p.is_null() {
            return p;
        }
    }
    unsafe { dlsym(RTLD_DEFAULT, cstr.as_ptr()) }
}

fn resolve_gl<T>(name: &[u8]) -> Option<T> {
    let sym = unsafe { dlsym(RTLD_DEFAULT, name.as_ptr() as *const c_char) };
    if !sym.is_null() {
        return Some(unsafe { std::mem::transmute_copy(&sym) });
    }
    let f = proc_loader()?;
    let via = unsafe { f(name.as_ptr() as *const c_char) };
    if via.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute_copy(&via) })
}

fn current_fbo() -> i32 {
    let getter: Option<unsafe extern "C" fn(u32, *mut c_int)> = resolve_gl(b"glGetIntegerv\0");
    match getter {
        Some(f) => {
            let mut id: c_int = 0;
            unsafe { f(GL_FRAMEBUFFER_BINDING, &mut id) };
            id
        }
        None => 0,
    }
}

fn fbo_color_size() -> Option<(i32, i32)> {
    let get_attach: unsafe extern "C" fn(u32, u32, u32, *mut c_int) =
        resolve_gl(b"glGetFramebufferAttachmentParameteriv\0")?;
    let bind_rb: unsafe extern "C" fn(u32, u32) = resolve_gl(b"glBindRenderbuffer\0")?;
    let get_rb: unsafe extern "C" fn(u32, u32, *mut c_int) =
        resolve_gl(b"glGetRenderbufferParameteriv\0")?;

    let mut obj_type: c_int = 0;
    unsafe {
        get_attach(
            GL_FRAMEBUFFER,
            GL_COLOR_ATTACHMENT0,
            GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
            &mut obj_type,
        );
    }
    if obj_type != GL_RENDERBUFFER as c_int {
        return None;
    }
    let mut rb_id: c_int = 0;
    unsafe {
        get_attach(
            GL_FRAMEBUFFER,
            GL_COLOR_ATTACHMENT0,
            GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME,
            &mut rb_id,
        );
    }
    if rb_id <= 0 {
        return None;
    }
    let mut w: c_int = 0;
    let mut h: c_int = 0;
    unsafe {
        bind_rb(GL_RENDERBUFFER, rb_id as u32);
        get_rb(GL_RENDERBUFFER, GL_RENDERBUFFER_WIDTH, &mut w);
        get_rb(GL_RENDERBUFFER, GL_RENDERBUFFER_HEIGHT, &mut h);
        bind_rb(GL_RENDERBUFFER, 0);
    }
    (w > 0 && h > 0).then_some((w, h))
}

fn detect_backend() -> Backend {
    if let Some(display) = gdk::Display::default() {
        let name = display.type_().name();
        if name.contains("Wayland") {
            return Backend::Wayland;
        }
        if name.contains("X11") {
            return Backend::X11;
        }
    }
    match std::env::var("XDG_SESSION_TYPE") {
        Ok(v) if v.eq_ignore_ascii_case("wayland") => Backend::Wayland,
        _ => Backend::X11,
    }
}

fn native_display(backend: Backend) -> u64 {
    let Some(display) = gdk::Display::default() else {
        return 0;
    };
    let stash: Stash<'_, *mut gdk::ffi::GdkDisplay, gdk::Display> = display.to_glib_none();
    let raw = stash.0 as *mut c_void;
    if raw.is_null() {
        return 0;
    }
    let native = match backend {
        Backend::X11 => unsafe { gdk_x11_display_get_xdisplay(raw) },
        Backend::Wayland => unsafe { gdk_wayland_display_get_wl_display(raw) },
    };
    native as u64
}

pub fn enforce_nvidia_x11() {
    if !std::path::Path::new("/proc/driver/nvidia/version").exists() {
        return;
    }
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        eprintln!("[harbor::mpv_linux] NVIDIA detected; setting WEBKIT_DISABLE_DMABUF_RENDERER=1 (WebKitGTK DMABUF renderer blanks on NVIDIA)");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    let wayland = std::env::var("XDG_SESSION_TYPE")
        .map(|v| v.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
        || std::env::var("WAYLAND_DISPLAY").map(|v| !v.is_empty()).unwrap_or(false);
    if !wayland {
        return;
    }
    eprintln!("[harbor::mpv_linux] NVIDIA + Wayland detected; forcing GDK_BACKEND=x11 (EGL on NVIDIA-Wayland crashes the GL context)");
    std::env::set_var("GDK_BACKEND", "x11");
}

pub fn prepare(mpv_ctx: NonNull<mpv_handle>) -> Result<(), String> {
    let backend = detect_backend();
    PROC_WAYLAND.store(backend == Backend::Wayland, Ordering::Relaxed);
    let display_native = native_display(backend);
    *pending_slot().lock().map_err(|e| format!("pending lock: {}", e))? = Some(Pending {
        mpv: MpvHandlePtr(mpv_ctx),
        backend,
        display_native,
    });
    Ok(())
}

pub fn install(gtk_window: &gtk::ApplicationWindow, vbox: &gtk::Box) -> Result<(), String> {
    {
        let mut existing = embed_slot().lock().map_err(|e| format!("embed lock: {}", e))?;
        if let Some(stale) = existing.take() {
            restore_webview(stale);
        }
    }
    let pending = pending_slot()
        .lock()
        .map_err(|e| format!("pending lock: {}", e))?
        .take()
        .ok_or_else(|| "no pending mpv ctx for linux install".to_string())?;

    apply_rgba_visual(gtk_window);
    let web_view = vbox
        .children()
        .into_iter()
        .next()
        .ok_or_else(|| "no webview child in vbox".to_string())?;

    let overlay = gtk::Overlay::new();
    let fixed = gtk::Fixed::new();
    let area = gtk::GLArea::new();
    area.set_use_es(false);
    area.set_has_depth_buffer(false);
    area.set_has_stencil_buffer(false);
    area.set_app_paintable(true);
    area.set_size_request(16, 16);

    gtk_window.remove(vbox);
    vbox.remove(&web_view);
    fixed.put(&area, 0, 0);
    overlay.add(&fixed);
    overlay.add_overlay(&web_view);
    overlay.set_overlay_pass_through(&web_view, false);
    gtk_window.add(&overlay);

    set_webview_transparent(&web_view);
    overlay.show_all();

    let render_cell: Rc<RefCell<Option<RenderContext>>> = Rc::new(RefCell::new(None));
    let mpv = pending.mpv;
    let backend = pending.backend;
    let display_native = pending.display_native;
    let area_for_cb = area.clone();

    area.connect_render(move |_widget, _ctx| {
        let mut slot = render_cell.borrow_mut();
        if slot.is_none() {
            match build_render_context(mpv, backend, display_native) {
                Ok(mut rc) => {
                    rc.set_update_callback(|| schedule_redraw());
                    *slot = Some(rc);
                }
                Err(e) => {
                    eprintln!("[harbor::mpv_linux] render ctx init failed: {}", e);
                    return glib::Propagation::Proceed;
                }
            }
        }
        if let Some(rc) = slot.as_ref() {
            do_render(rc, &area_for_cb);
        }
        glib::Propagation::Stop
    });

    *embed_slot().lock().map_err(|e| format!("embed lock: {}", e))? = Some(Embed {
        area: area.clone(),
        overlay,
        gtk_window: gtk_window.clone(),
        vbox: vbox.clone(),
        web_view,
    });

    area.queue_render();
    eprintln!("[harbor::mpv_linux] installed backend={}", backend_label(backend));
    Ok(())
}

fn build_render_context(
    mpv: MpvHandlePtr,
    backend: Backend,
    display_native: u64,
) -> Result<RenderContext, String> {
    let init_params = OpenGLInitParams::<()> {
        get_proc_address,
        ctx: (),
    };
    let mut params: Vec<RenderParam<()>> = vec![
        RenderParam::ApiType(RenderParamApiType::OpenGl),
        RenderParam::InitParams(init_params),
    ];
    if display_native != 0 {
        let ptr = display_native as *const c_void;
        match backend {
            Backend::X11 => params.push(RenderParam::X11Display(ptr)),
            Backend::Wayland => params.push(RenderParam::WaylandDisplay(ptr)),
        }
    }
    let mpv_ref: &mut mpv_handle = unsafe { &mut *mpv.0.as_ptr() };
    RenderContext::new(mpv_ref, params).map_err(|e| format!("render init: {:?}", e))
}

fn do_render(rc: &RenderContext, area: &gtk::GLArea) {
    area.attach_buffers();
    let fbo = current_fbo();
    let (w, h, measured) = match fbo_color_size() {
        Some((mw, mh)) => (mw, mh, true),
        None => (
            area.allocated_width().max(1),
            area.allocated_height().max(1),
            false,
        ),
    };
    let packed = ((w as u64) << 32) | (h as u32 as u64);
    if LAST_SURFACE.swap(packed, Ordering::Relaxed) != packed {
        eprintln!(
            "[harbor::mpv_linux] render surface {}x{} px ({})",
            w,
            h,
            if measured { "measured fbo" } else { "computed scale" }
        );
    }
    if fbo == 0 && !FBO_ZERO_WARNED.swap(true, Ordering::Relaxed) {
        eprintln!("[harbor::mpv_linux] WARNING: GtkGLArea FBO query returned 0; mpv will render to the default framebuffer and the video region will stay BLACK. glGetIntegerv or the GL proc loader likely failed to resolve.");
    }
    let _ = rc.render::<()>(fbo, w, h, true);
}

pub fn resize_to(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    css_view_w: f64,
    css_view_h: f64,
) -> Result<(), String> {
    let guard = embed_slot().lock().map_err(|e| format!("embed lock: {}", e))?;
    let Some(embed) = guard.as_ref() else {
        return Ok(());
    };
    let sx = if css_view_w > 0.0 { embed.gtk_window.allocated_width().max(1) as f64 / css_view_w } else { 1.0 };
    let sy = if css_view_h > 0.0 { embed.gtk_window.allocated_height().max(1) as f64 / css_view_h } else { 1.0 };
    let lw = (w * sx).round().max(1.0) as i32;
    let lh = (h * sy).round().max(1.0) as i32;
    embed.area.set_size_request(lw, lh);
    if let Some(parent) = embed.area.parent() {
        if let Some(fixed) = parent.downcast_ref::<gtk::Fixed>() {
            let lx = (x * sx).round() as i32;
            let ly = (y * sy).round() as i32;
            fixed.move_(&embed.area, lx, ly);
        }
    }
    embed.area.queue_render();
    Ok(())
}

pub fn uninstall() -> Result<(), String> {
    let mut guard = embed_slot().lock().map_err(|e| format!("embed lock: {}", e))?;
    let Some(embed) = guard.take() else {
        return Ok(());
    };
    restore_webview(embed);
    eprintln!("[harbor::mpv_linux] uninstalled");
    Ok(())
}

fn restore_webview(embed: Embed) {
    set_webview_opaque(&embed.web_view);
    if let Some(parent) = embed.web_view.parent() {
        if let Some(container) = parent.downcast_ref::<gtk::Container>() {
            container.remove(&embed.web_view);
        }
    }
    if embed.overlay.parent().is_some() {
        if let Some(parent) = embed.overlay.parent() {
            if let Some(container) = parent.downcast_ref::<gtk::Container>() {
                container.remove(&embed.overlay);
            }
        }
    }
    if embed.web_view.parent().is_none() {
        embed.vbox.pack_start(&embed.web_view, true, true, 0);
        embed.web_view.show();
    }
    if embed.vbox.parent().is_none() {
        embed.gtk_window.add(&embed.vbox);
    }
    embed.vbox.show_all();
}

fn schedule_redraw() {
    if REDRAW_PENDING.swap(true, Ordering::AcqRel) {
        return;
    }
    glib::idle_add(|| {
        REDRAW_PENDING.store(false, Ordering::Release);
        if let Ok(guard) = embed_slot().lock() {
            if let Some(embed) = guard.as_ref() {
                embed.area.queue_render();
            }
        }
        glib::ControlFlow::Break
    });
}

fn apply_rgba_visual(window: &gtk::ApplicationWindow) {
    if let Some(screen) = GtkWindowExt::screen(window) {
        if let Some(visual) = screen.rgba_visual() {
            window.set_visual(Some(&visual));
            window.set_app_paintable(true);
        }
    }
}

fn set_webview_transparent(web_view: &gtk::Widget) {
    web_view.set_app_paintable(true);
    set_webview_bg_alpha(web_view, 0.0);
}

fn set_webview_opaque(web_view: &gtk::Widget) {
    web_view.set_app_paintable(false);
    set_webview_bg_alpha(web_view, 1.0);
}

fn set_webview_bg_alpha(web_view: &gtk::Widget, alpha: f64) {
    let setter: Option<unsafe extern "C" fn(*mut c_void, *const GdkRgba)> =
        resolve_symbol(b"webkit_web_view_set_background_color\0");
    if let Some(f) = setter {
        let stash: Stash<'_, *mut gtk::ffi::GtkWidget, gtk::Widget> = web_view.to_glib_none();
        let ptr = stash.0 as *mut c_void;
        let color = GdkRgba {
            red: 0.0,
            green: 0.0,
            blue: 0.0,
            alpha,
        };
        unsafe { f(ptr, &color) };
    }
}

fn resolve_symbol<T>(name: &[u8]) -> Option<T> {
    let sym = unsafe { dlsym(RTLD_DEFAULT, name.as_ptr() as *const c_char) };
    if sym.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute_copy(&sym) })
}

#[repr(C)]
struct GdkRgba {
    red: f64,
    green: f64,
    blue: f64,
    alpha: f64,
}

fn backend_label(backend: Backend) -> &'static str {
    match backend {
        Backend::X11 => "x11",
        Backend::Wayland => "wayland",
    }
}
