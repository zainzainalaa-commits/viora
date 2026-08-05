// Portable across desktop and Android: pure logic, HTTP, sockets and the
// torrent engine. Modules that shell out to ffmpeg/yt-dlp stay here too — the
// spawn only fails at runtime, and the frontend gates them via its capability
// table rather than the module being absent.
mod cast;
mod cast_hls;
mod cast_server;
mod cast_subs;
mod cf_relay;
mod dlna;
mod download;
mod dvr;
mod fonts;
mod http_fetch;
mod local_lib;
mod roku;
mod power;
mod airplay;
mod settings_store;
mod song_id;
mod stream_proxy;
mod streams;
mod stremio_auth;
mod sub_extract;
mod subsync;
mod thumbs;
mod torrent_engine;
mod trailer;
mod transcode;
mod web_server;

// Desktop only. These bind libmpv, the Discord IPC socket, the tray, or extra
// OS windows — none of which exist on Android.
#[cfg(desktop)]
mod anime4k;
#[cfg(desktop)]
mod browser;
#[cfg(desktop)]
mod discord_rp;
#[cfg(desktop)]
mod fullscreen;
#[cfg(desktop)]
mod hdr_overlay;
#[cfg(desktop)]
mod modal_overlay;
#[cfg(desktop)]
mod mpv;
#[cfg(desktop)]
mod multiview;
#[cfg(desktop)]
mod pip;
#[cfg(desktop)]
mod proc_mem;
#[cfg(desktop)]
mod svp;
#[cfg(desktop)]
mod tray;
#[cfg(desktop)]
mod webview_helpers;
#[cfg(target_os = "macos")]
mod mpv_render_mac;
#[cfg(target_os = "linux")]
mod mpv_render_linux;
#[cfg(target_os = "macos")]
mod pip_mac;

pub(crate) fn shutdown_services(app: &tauri::AppHandle) {
    cast_server::stop();
    torrent_engine::stop();
    #[cfg(desktop)]
    discord_rp::shutdown(app);
    #[cfg(mobile)]
    let _ = app;
}

pub static CLOSE_FLUSH_DONE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static CLOSE_IN_PROGRESS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn harbor_flush_done() {
    CLOSE_FLUSH_DONE.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[cfg(desktop)]
#[tauri::command]
fn close_aux_windows(app: tauri::AppHandle) {
    use tauri::Manager;
    for (label, window) in app.webview_windows() {
        if label != "main" {
            let _ = window.close();
        }
    }
}

// Android declares its intent filters in the manifest, so there is nothing to
// register or unregister at runtime.
#[cfg(desktop)]
#[tauri::command]
async fn deeplink_set_stremio(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_deep_link::DeepLinkExt;
    if enabled {
        app.deep_link()
            .register("stremio")
            .map_err(|e| format!("register stremio: {}", e))?;
    } else {
        let _ = app.deep_link().unregister("stremio");
    }
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
async fn deeplink_is_stremio_registered(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_deep_link::DeepLinkExt;
    app.deep_link()
        .is_registered("stremio")
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_text_file(path: String, contents: String) -> Result<(), String> {
    let target = std::path::PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create folder: {}", e))?;
        }
    }
    std::fs::write(&target, contents.as_bytes()).map_err(|e| format!("write file: {}", e))
}

#[cfg(windows)]
fn make_main_transparent(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[harbor::transparent] main window missing");
        return;
    };
    let res = window.with_webview(|webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Controller2, COREWEBVIEW2_COLOR,
        };
        use windows::core::Interface;
        let controller = webview.controller();
        match controller.cast::<ICoreWebView2Controller2>() {
            Ok(controller2) => {
                let color = COREWEBVIEW2_COLOR { A: 0, R: 0, G: 0, B: 0 };
                match controller2.SetDefaultBackgroundColor(color) {
                    Ok(()) => eprintln!("[harbor::transparent] SetDefaultBackgroundColor OK (alpha=0)"),
                    Err(e) => eprintln!("[harbor::transparent] SetDefaultBackgroundColor FAILED: {:?}", e),
                }
            }
            Err(e) => eprintln!("[harbor::transparent] cast to Controller2 FAILED: {:?}", e),
        }
    });
    if let Err(e) = res {
        eprintln!("[harbor::transparent] with_webview FAILED: {:?}", e);
    }
}

#[cfg(windows)]
pub(crate) fn force_show_foreground(window: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
        let _ = SetForegroundWindow(hwnd);
    }
}

#[cfg(windows)]
const HARBOR_MAXGUARD_SUBCLASS_ID: usize = 0x4842_4D47;

#[cfg(windows)]
unsafe extern "system" fn maxguard_subclass_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::{MINMAXINFO, WM_GETMINMAXINFO};
    let res = DefSubclassProc(hwnd, msg, wparam, lparam);
    if msg == WM_GETMINMAXINFO {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut mi).as_bool() {
            let mmi = &mut *(lparam.0 as *mut MINMAXINFO);
            mmi.ptMaxPosition.x = mi.rcWork.left - mi.rcMonitor.left;
            mmi.ptMaxPosition.y = mi.rcWork.top - mi.rcMonitor.top;
            mmi.ptMaxSize.x = mi.rcWork.right - mi.rcWork.left;
            mmi.ptMaxSize.y = mi.rcWork.bottom - mi.rcWork.top;
        }
    }
    res
}

#[cfg(windows)]
fn install_maximize_guard(app: &tauri::AppHandle) {
    use tauri::Manager;
    use windows::Win32::UI::Shell::SetWindowSubclass;
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[harbor::maxguard] main window missing");
        return;
    };
    let Ok(hwnd) = window.hwnd() else {
        eprintln!("[harbor::maxguard] hwnd unavailable");
        return;
    };
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(maxguard_subclass_proc), HARBOR_MAXGUARD_SUBCLASS_ID, 0);
    }
    eprintln!("[harbor::maxguard] WM_GETMINMAXINFO work-area guard installed");
}

#[tauri::command]
fn harbor_set_webview_memory_low(app: tauri::AppHandle, low: bool) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
            };
            use windows::core::Interface;
            let controller = webview.controller();
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(w3) = core.cast::<ICoreWebView2_19>() {
                    let level = if low {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                    } else {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                    };
                    let _ = w3.SetMemoryUsageTargetLevel(level);
                }
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (&app, low);
    }
}

#[tauri::command]
fn harbor_set_webview_visible(app: tauri::AppHandle, visible: bool) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            let _ = webview.controller().SetIsVisible(visible);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (&app, visible);
    }
}

#[tauri::command]
fn harbor_try_suspend_webview(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
            use webview2_com::TrySuspendCompletedHandler;
            use windows::core::Interface;
            let controller = webview.controller();
            let _ = controller.SetIsVisible(false);
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(c3) = core.cast::<ICoreWebView2_3>() {
                    let handler = TrySuspendCompletedHandler::create(Box::new(|_hr, _ok| Ok(())));
                    let _ = c3.TrySuspend(&handler);
                }
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = &app;
    }
}

#[tauri::command]
fn harbor_resume_webview(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
            use windows::core::Interface;
            let controller = webview.controller();
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(c3) = core.cast::<ICoreWebView2_3>() {
                    let _ = c3.Resume();
                }
            }
            let _ = controller.SetIsVisible(true);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = &app;
    }
}

#[cfg(desktop)]
fn ensure_window_on_screen(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let (pos, size) = match (window.outer_position(), window.outer_size()) {
        (Ok(p), Ok(s)) => (p, s),
        _ => return,
    };
    let monitors = match window.available_monitors() {
        Ok(m) if !m.is_empty() => m,
        _ => return,
    };
    let ww = size.width as i32;
    let wh = size.height as i32;
    let on_screen = monitors.iter().any(|m| {
        let mp = m.position();
        let ms = m.size();
        pos.x < mp.x + ms.width as i32
            && pos.x + ww > mp.x
            && pos.y < mp.y + ms.height as i32
            && pos.y + wh > mp.y
    });
    if on_screen {
        return;
    }
    let target = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.into_iter().next());
    let Some(mon) = target else {
        return;
    };
    let mp = mon.position();
    let ms = mon.size();
    let cx = mp.x + (ms.width as i32 - ww).max(0) / 2;
    let cy = mp.y + (ms.height as i32 - wh).max(0) / 2;
    let _ = window.set_position(tauri::PhysicalPosition::new(cx, cy));
    eprintln!("[harbor::window] launched off-screen; recentered to {},{}", cx, cy);
}

const MEDIA_EXTS: &[&str] = &[
    "mkv", "mp4", "avi", "mov", "webm", "m4v", "ts", "m2ts", "mpg", "mpeg", "wmv", "flv", "ogv", "3gp",
];

fn media_file_from_args(args: &[String]) -> Option<String> {
    for a in args {
        let lower = a.to_lowercase();
        if MEDIA_EXTS.iter().any(|e| lower.ends_with(&format!(".{e}")))
            && std::path::Path::new(a).is_file()
        {
            return Some(a.clone());
        }
    }
    None
}

static PENDING_OPEN_FILE: std::sync::OnceLock<std::sync::Mutex<Option<String>>> =
    std::sync::OnceLock::new();

fn pending_open_file() -> &'static std::sync::Mutex<Option<String>> {
    PENDING_OPEN_FILE.get_or_init(|| std::sync::Mutex::new(None))
}

#[tauri::command]
fn harbor_take_pending_file() -> Option<String> {
    pending_open_file().lock().ok().and_then(|mut g| g.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    {
        let args: Vec<String> = std::env::args().skip(1).collect();
        if let Some(p) = media_file_from_args(&args) {
            if let Ok(mut g) = pending_open_file().lock() {
                *g = Some(p);
            }
        }
    }
    #[cfg(windows)]
    svp::prime_svp_env();
    #[cfg(target_os = "linux")]
    mpv_render_linux::enforce_nvidia_x11();
    let _ = rustls::crypto::ring::default_provider().install_default();
    trailer::sweep_cache();
    let proxy_state = tauri::async_runtime::block_on(stream_proxy::ProxyState::start())
        .unwrap_or_else(|e| {
            eprintln!("[stream-proxy] failed to start: {}", e);
            stream_proxy::ProxyState::placeholder()
        });
    let thumbs_state = thumbs::ThumbsState::new();
    let dvr_state = dvr::DvrState::new();

    let app_builder = tauri::Builder::default();

    // Single-instance, the updater and window-state are desktop-only upstream:
    // Android has one process per task, ships updates through the store, and
    // has no window geometry worth persisting.
    #[cfg(desktop)]
    let app_builder = app_builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::{Emitter, Manager};
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
                #[cfg(windows)]
                force_show_foreground(&w);
            }
            if let Some(url) = args.iter().find(|a| a.starts_with("harbor://")) {
                let _ = app.emit("harbor:stremio-deeplink", url.clone());
            }
            if let Some(path) = media_file_from_args(&args) {
                let _ = app.emit("harbor:open-file", path);
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        );

    let app_builder = app_builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .manage(proxy_state)
        .manage(thumbs_state)
        .manage(dvr_state)
        .manage(download::DownloadState::new());

    #[cfg(desktop)]
    let app_builder = app_builder
        .manage(mpv::MpvState::new())
        .manage(pip::PipState::new())
        .manage(fullscreen::FullscreenState::new())
        .manage(multiview::MultiviewState::new())
        .manage(modal_overlay::ModalOverlayState::new())
        .manage(discord_rp::DiscordState::new());

    #[cfg(target_os = "macos")]
    let app_builder = app_builder.register_uri_scheme_protocol("stremio", |ctx, request| {
        use tauri::Emitter;
        let url = request.uri().to_string();
        let _ = ctx.app_handle().emit("harbor:stremio-deeplink", url);
        tauri::http::Response::builder()
            .status(200)
            .header("content-type", "text/html; charset=utf-8")
            .body(b"<!doctype html><meta charset=\"utf-8\"><title>Harbor</title>".to_vec())
            .unwrap()
    });

    app_builder
        .setup(move |app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    eprintln!("[harbor::deep-link] register_all failed: {:?}", e);
                }
            }
            #[cfg(windows)]
            make_main_transparent(&app.handle());
            #[cfg(windows)]
            install_maximize_guard(&app.handle());
            #[cfg(windows)]
            {
                use tauri::Manager;
                if let Ok(res) = app.path().resource_dir() {
                    let mpv = res.join("mpv.exe");
                    if mpv.exists() {
                        thumbs::set_bundled_mpv(mpv);
                    }
                }
            }
            #[cfg(desktop)]
            ensure_window_on_screen(&app.handle());
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.handle().get_webview_window("main") {
                    if let Ok(ns_window) = window.ns_window() {
                        let ns_window_ptr = ns_window as i64;
                        if let Err(e) = mpv_render_mac::install_window_rounding(ns_window_ptr) {
                            eprintln!("[harbor::mac] rounding failed: {}", e);
                        }
                        if let Err(e) = mpv_render_mac::make_resizable(ns_window_ptr) {
                            eprintln!("[harbor::mac] resizable failed: {}", e);
                        }
                    }
                }
            }
            cast_server::ensure_started_on_setup(&app.handle());
            torrent_engine::ensure_started_on_setup(&app.handle());
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || discord_rp::run_loop(handle));
            }
            #[cfg(desktop)]
            if let Err(e) = tray::build(&app.handle()) {
                eprintln!("[harbor::tray] build failed: {:?}", e);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            use tauri::Manager;
            match event {
                // Android tears the activity down itself; hide/destroy and the
                // tray have no counterpart there.
                #[cfg(desktop)]
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if tray::close_to_tray() {
                        api.prevent_close();
                        let _ = window.hide();
                    } else if !CLOSE_IN_PROGRESS.swap(true, std::sync::atomic::Ordering::SeqCst) {
                        use tauri::Emitter;
                        api.prevent_close();
                        CLOSE_FLUSH_DONE.store(false, std::sync::atomic::Ordering::SeqCst);
                        let _ = window.emit("harbor://app-closing", ());
                        let w = window.clone();
                        std::thread::spawn(move || {
                            for _ in 0..24 {
                                if CLOSE_FLUSH_DONE.load(std::sync::atomic::Ordering::SeqCst) {
                                    break;
                                }
                                std::thread::sleep(std::time::Duration::from_millis(50));
                            }
                            let _ = w.destroy();
                        });
                    }
                }
                tauri::WindowEvent::Focused(focused) => {
                    use tauri::Emitter;
                    let minimized = if *focused {
                        false
                    } else {
                        window.is_minimized().unwrap_or(false)
                            || !window.is_visible().unwrap_or(true)
                    };
                    let _ = window.emit(
                        "harbor://window-activity",
                        serde_json::json!({ "focused": *focused, "minimized": minimized }),
                    );
                }
                tauri::WindowEvent::Destroyed => {
                    shutdown_services(window.app_handle());
                }
                _ => {}
            }
        })
        .invoke_handler(invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// `generate_handler!` takes one flat list and cannot carry `#[cfg]` on its
// entries, so the desktop and mobile command surfaces are declared separately.
// Anything absent here is simply not registered on Android; the frontend asks
// `can(...)` before invoking, so the call is never made in the first place.
#[cfg(desktop)]
fn invoke_handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        harbor_flush_done,
        close_aux_windows,
        power::power_inhibit,
        harbor_set_webview_memory_low,
        harbor_set_webview_visible,
        harbor_try_suspend_webview,
        harbor_resume_webview,
        save_text_file,
        subsync::moviehash::compute_moviehash,
        subsync::sync_subtitle,
        sub_extract::subtitle_extract,
        cast_server::stop_stremio_sidecar,
        cast_server::cast_server_stop,
        web_server::web_serve_start,
        web_server::web_serve_stop,
        web_server::web_serve_status,
        anime4k::anime4k_download,
        anime4k::anime4k_dir,
        svp::svp_status,
        svp::svp_launch,
        svp::svp_ensure_running,
        svp::svp_apply,
        settings_store::settings_read,
        settings_store::settings_write,
        proc_mem::harbor_process_memory,
        trailer::fetch_trailer,
        download::download_start,
        download::download_cancel,
        stream_proxy::proxy_register,
        stream_proxy::proxy_unregister,
        stream_proxy::proxy_gc_idle,
        cf_relay::cf_list_accounts,
        cf_relay::cf_deploy_relay,
        cf_relay::cf_delete_relay,
        cf_relay::cf_relay_status,
        mpv::mpv_probe,
        mpv::mpv_start,
        mpv::mpv_command,
        mpv::mpv_set_property,
        mpv::mpv_get_property,
        mpv::mpv_audio_devices,
        mpv::mpv_set_geometry,
        mpv::mpv_force_below,
        mpv::mpv_export_log,
        mpv::mpv_set_hdr_stage,
        mpv::display_hdr_active,
        webview_helpers::webview_reapply_transparency,
        mpv::mpv_on_pip_changed,
        mpv::mpv_screenshot_data_url,
        mpv::mpv_save_screenshot,
        mpv::mpv_gif_start,
        mpv::mpv_gif_stop,
        mpv::mpv_gif_abort,
        mpv::mpv_clip_save,
        modal_overlay::modal_overlay_open,
        modal_overlay::modal_overlay_close,
        modal_overlay::modal_overlay_emit_state,
        modal_overlay::modal_overlay_emit_action,
        modal_overlay::modal_overlay_sync,
        modal_overlay::modal_overlay_get_pending,
        hdr_overlay::hdr_overlay_open,
        hdr_overlay::hdr_overlay_close,
        hdr_overlay::hdr_overlay_hide,
        hdr_overlay::hdr_overlay_sync,
        hdr_overlay::hdr_overlay_emit_props,
        hdr_overlay::hdr_overlay_emit_action,
        mpv::mpv_sub_add,
        mpv::sub_download,
        mpv::mpv_stop,
        pip::pip_open,
        pip::pip_get_session,
        pip::pip_close,
        pip::pip_publish_state,
        pip::window_pip_enter,
        pip::window_pip_exit,
        fullscreen::window_fullscreen_enter,
        fullscreen::window_fullscreen_exit,
        browser::browser_open,
        browser::browser_close,
        thumbs::thumbs_set_url,
        thumbs::thumbs_spawn_eager,
        thumbs::thumbs_get,
        thumbs::thumbs_stop,
        dvr::dvr_start,
        dvr::dvr_stop,
        dvr::dvr_list,
        dvr::dvr_default_dir,
        dvr::dvr_reveal,
        multiview::multiview_open,
        multiview::multiview_prespawn,
        multiview::multiview_geometry,
        multiview::multiview_audio_focus,
        multiview::multiview_close,
        multiview::multiview_visibility,
        multiview::multiview_stop_all,
        http_fetch::harbor_fetch,
        discord_rp::discord_set_presence,
        discord_rp::discord_clear,
        discord_rp::discord_set_enabled,
        cast::cast_discover,
        dlna::lan_ip,
        cast::cast_load,
        cast::cast_play,
        cast::cast_pause,
        cast::cast_seek,
        cast::cast_stop,
        cast::cast_status,
        cast_server::cast_server_status,
        cast_server::cast_server_restart,
        torrent_engine::torrent_engine_status,
        torrent_engine::torrent_engine_add,
        torrent_engine::torrent_engine_select,
        torrent_engine::torrent_engine_stats,
        torrent_engine::torrent_engine_remove,
        torrent_engine::torrent_engine_selftest,
        torrent_engine::torrent_engine_restart,
        torrent_engine::torrent_engine_hard_reset,
        torrent_engine::torrent_engine_set_options,
        transcode::cast_ffmpeg_present,
        streams::streams_run_pipeline,
        streams::streams_parse,
        streams::streams_core_version,
        local_lib::harbor_scan_folder,
        tray::tray_set_prefs,
        tray::tray_set_custom_themes,
        stremio_auth::stremio_auth_start,
        song_id::recognize_now_playing,
        deeplink_set_stremio,
        deeplink_is_stremio_registered,
        harbor_take_pending_file,
    ]
}

#[cfg(mobile)]
fn invoke_handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        harbor_flush_done,
        power::power_inhibit,
        harbor_set_webview_memory_low,
        harbor_set_webview_visible,
        harbor_try_suspend_webview,
        harbor_resume_webview,
        save_text_file,
        subsync::moviehash::compute_moviehash,
        subsync::sync_subtitle,
        sub_extract::subtitle_extract,
        cast_server::stop_stremio_sidecar,
        cast_server::cast_server_stop,
        web_server::web_serve_start,
        web_server::web_serve_stop,
        web_server::web_serve_status,
        settings_store::settings_read,
        settings_store::settings_write,
        trailer::fetch_trailer,
        download::download_start,
        download::download_cancel,
        stream_proxy::proxy_register,
        stream_proxy::proxy_unregister,
        stream_proxy::proxy_gc_idle,
        cf_relay::cf_list_accounts,
        cf_relay::cf_deploy_relay,
        cf_relay::cf_delete_relay,
        cf_relay::cf_relay_status,
        thumbs::thumbs_set_url,
        thumbs::thumbs_spawn_eager,
        thumbs::thumbs_get,
        thumbs::thumbs_stop,
        dvr::dvr_start,
        dvr::dvr_stop,
        dvr::dvr_list,
        dvr::dvr_default_dir,
        dvr::dvr_reveal,
        http_fetch::harbor_fetch,
        cast::cast_discover,
        dlna::lan_ip,
        cast::cast_load,
        cast::cast_play,
        cast::cast_pause,
        cast::cast_seek,
        cast::cast_stop,
        cast::cast_status,
        cast_server::cast_server_status,
        cast_server::cast_server_restart,
        torrent_engine::torrent_engine_status,
        torrent_engine::torrent_engine_add,
        torrent_engine::torrent_engine_select,
        torrent_engine::torrent_engine_stats,
        torrent_engine::torrent_engine_remove,
        torrent_engine::torrent_engine_selftest,
        torrent_engine::torrent_engine_restart,
        torrent_engine::torrent_engine_hard_reset,
        torrent_engine::torrent_engine_set_options,
        transcode::cast_ffmpeg_present,
        streams::streams_run_pipeline,
        streams::streams_parse,
        streams::streams_core_version,
        local_lib::harbor_scan_folder,
        stremio_auth::stremio_auth_start,
        song_id::recognize_now_playing,
        harbor_take_pending_file,
    ]
}
