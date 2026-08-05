use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

#[derive(serde::Serialize)]
pub struct SvpStatus {
    installed: bool,
    ready: bool,
    loadable: Option<bool>,
    load_error: Option<String>,
}

static LAST_LOAD: Mutex<Option<Result<(), String>>> = Mutex::new(None);

fn svp_root() -> Option<PathBuf> {
    let mut cands = vec![
        PathBuf::from("C:\\Program Files (x86)\\SVP 4"),
        PathBuf::from("C:\\Program Files\\SVP 4"),
    ];
    for env in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(p) = std::env::var(env) {
            cands.push(PathBuf::from(&p).join("SVP 4"));
            cands.push(PathBuf::from(&p).join("Programs").join("SVP 4"));
        }
    }
    cands.into_iter().find(|d| d.join("SVPManager.exe").exists())
}

fn find_file_dir(root: &Path, names: &[&str], depth: u32) -> Option<PathBuf> {
    find_all_file_dirs(root, names, depth).into_iter().next()
}

fn find_all_file_dirs(root: &Path, names: &[&str], depth: u32) -> Vec<PathBuf> {
    let mut hits = Vec::new();
    collect_file_dirs(root, names, depth, &mut hits);
    hits
}

fn collect_file_dirs(root: &Path, names: &[&str], depth: u32, out: &mut Vec<PathBuf>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    let mut subdirs = Vec::new();
    let mut matched = false;
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            subdirs.push(p);
        } else if !matched {
            if let Some(n) = p.file_name() {
                let n = n.to_string_lossy();
                if names.iter().any(|t| n.eq_ignore_ascii_case(t)) {
                    matched = true;
                }
            }
        }
    }
    if matched {
        out.push(root.to_path_buf());
    }
    for d in subdirs {
        collect_file_dirs(&d, names, depth - 1, out);
    }
}

fn dir_has_python(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|e| {
        let n = e.file_name();
        let n = n.to_string_lossy().to_ascii_lowercase();
        n.starts_with("python3") && n.ends_with(".dll")
    })
}

fn svpflow_dir(root: &Path) -> Option<PathBuf> {
    find_file_dir(root, &["svpflow1_vs.dll", "svpflow1_vs64.dll"], 5)
}

fn vsscript_dir(root: &Path) -> Option<PathBuf> {
    let dirs = find_all_file_dirs(root, &["VSScript.dll"], 5);
    dirs.iter()
        .find(|d| dir_has_python(d) && d.to_string_lossy().contains("64"))
        .or_else(|| dirs.iter().find(|d| dir_has_python(d)))
        .or_else(|| dirs.iter().find(|d| d.to_string_lossy().contains("64")))
        .cloned()
        .or_else(|| dirs.into_iter().next())
}

#[cfg(windows)]
fn preload_vsscript_chain(dir: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::{LoadLibraryExW, LOAD_WITH_ALTERED_SEARCH_PATH};

    fn wide(p: &Path) -> Vec<u16> {
        p.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
    }
    fn load(p: &Path) -> Result<(), u32> {
        let w = wide(p);
        unsafe {
            LoadLibraryExW(PCWSTR(w.as_ptr()), None, LOAD_WITH_ALTERED_SEARCH_PATH)
                .map(|_| ())
                .map_err(|e| (e.code().0 as u32) & 0xffff)
        }
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let name = e.file_name();
            let low = name.to_string_lossy().to_ascii_lowercase();
            if low.starts_with("python3") && low.ends_with(".dll") {
                let _ = load(&e.path());
            }
        }
    }
    let _ = load(&dir.join("vapoursynth.dll"));

    let vsscript = dir.join("VSScript.dll");
    match load(&vsscript) {
        Ok(()) => Ok(()),
        Err(code) => Err(format!("VSScript.dll failed to load (0x{:x})", code)),
    }
}

#[cfg(windows)]
fn crt_set_vsscript_path(value: &str) {
    use windows::core::{s, PCWSTR};
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};

    let entry: Vec<u16> = format!("VSSCRIPT_PATH={}", value)
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    for module in ["ucrtbase.dll\0", "msvcrt.dll\0"] {
        let mw: Vec<u16> = module.encode_utf16().collect();
        unsafe {
            let Ok(h) = GetModuleHandleW(PCWSTR(mw.as_ptr())) else {
                continue;
            };
            if let Some(p) = GetProcAddress(h, s!("_wputenv")) {
                let f: unsafe extern "C" fn(*const u16) -> i32 = std::mem::transmute(p);
                let _ = f(entry.as_ptr());
            }
        }
    }
}

pub fn prime_svp_env() {
    let Some(root) = svp_root() else {
        return;
    };
    let Some(vs) = vsscript_dir(&root) else {
        return;
    };
    let vs_str = vs.to_string_lossy().into_owned();
    let current = std::env::var("PATH").unwrap_or_default();
    if !current.split(';').any(|p| p.eq_ignore_ascii_case(&vs_str)) {
        std::env::set_var("PATH", format!("{};{}", vs_str, current));
    }

    let vsscript_file = vs.join("VSScript.dll");
    let file_str = vsscript_file.to_string_lossy().into_owned();
    std::env::set_var("VSSCRIPT_PATH", &file_str);

    #[cfg(windows)]
    {
        let result = preload_vsscript_chain(&vs);
        crt_set_vsscript_path(&file_str);
        if let Ok(mut guard) = LAST_LOAD.lock() {
            *guard = Some(result);
        }
    }
}

#[tauri::command]
pub fn svp_status() -> SvpStatus {
    let root = svp_root();
    let ready = root
        .as_ref()
        .map_or(false, |r| svpflow_dir(r).is_some() && vsscript_dir(r).is_some());
    let (loadable, load_error) = match LAST_LOAD.lock().ok().and_then(|g| g.clone()) {
        Some(Ok(())) => (Some(true), None),
        Some(Err(msg)) => (Some(false), Some(msg)),
        None => (None, None),
    };
    SvpStatus {
        installed: root.is_some(),
        ready,
        loadable,
        load_error,
    }
}

#[cfg(windows)]
fn svp_manager_running() -> bool {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let snapshot = match unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) } {
        Ok(h) => h,
        Err(_) => return false,
    };
    let mut found = false;
    unsafe {
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                if name.eq_ignore_ascii_case("SVPManager.exe") {
                    found = true;
                    break;
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    found
}

fn launch_svp_manager() -> Result<(), String> {
    let root = svp_root().ok_or_else(|| "SVP Manager is not installed".to_string())?;
    let exe = root.join("SVPManager.exe");
    std::process::Command::new(&exe)
        .current_dir(&root)
        .spawn()
        .map_err(|e| format!("launch SVP Manager: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn svp_launch() -> Result<(), String> {
    launch_svp_manager()
}

#[tauri::command]
pub fn svp_ensure_running() -> Result<bool, String> {
    #[cfg(windows)]
    {
        if svp_manager_running() {
            return Ok(false);
        }
        launch_svp_manager()?;
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

const VPY_TEMPLATE: &str = r#"import vapoursynth as vs
import os
from fractions import Fraction
core = vs.core

def _load(name):
    base = r"__DIR__"
    for n in (name, name.replace("_vs", "_vs64")):
        p = os.path.join(base, n)
        if os.path.exists(p):
            core.std.LoadPlugin(p)
            return
_load("svpflow1_vs.dll")
_load("svpflow2_vs.dll")

clip = video_in
_f = clip.format
if _f is None or _f.color_family != vs.YUV or _f.bits_per_sample != 8 or _f.subsampling_w != 1 or _f.subsampling_h != 1:
    clip = core.resize.Bicubic(clip, format=vs.YUV420P8, dither_type="error_diffusion")
src = container_fps if container_fps and container_fps > 1 else 23.976

target = __TARGET__
if target == -1:
    target = src * 2
elif target <= 0:
    target = display_fps if display_fps and display_fps > src else src * 2
if target < src:
    target = src

fr = Fraction(target / src).limit_denominator(1000)
num, den = fr.numerator, fr.denominator

sup = core.svp1.Super(clip, "{gpu:1}")
vec = core.svp1.Analyse(sup["clip"], sup["data"], clip, "{}")
smooth = core.svp2.SmoothFps(clip, sup["clip"], sup["data"], vec["clip"], vec["data"],
    "{rate:{num:%d,den:%d},algo:13,mask:{cover:80}}" % (num, den), src=clip, fps=src)
smooth = core.std.AssumeFPS(smooth, fpsnum=int(round(src * num / den * 1000)), fpsden=1000)
smooth.set_output()
"#;

#[tauri::command]
pub fn svp_apply(app: tauri::AppHandle, target_fps: String) -> Result<String, String> {
    let root = svp_root().ok_or_else(|| "SVP is not installed".to_string())?;
    let flow = svpflow_dir(&root).ok_or_else(|| "svpflow plugins not found in the SVP install".to_string())?;
    vsscript_dir(&root)
        .ok_or_else(|| "VapourSynth (VSScript.dll) not found in the SVP install".to_string())?;
    prime_svp_env();

    let out_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("svp");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("create dir: {}", e))?;
    let target = match target_fps.as_str() {
        "double" => "-1",
        "48" => "48",
        "60" => "60",
        _ => "0",
    };
    let script = VPY_TEMPLATE
        .replace("__DIR__", flow.to_string_lossy().trim_end_matches('\\'))
        .replace("__TARGET__", target);
    let vpy = out_dir.join("svp.vpy");
    std::fs::write(&vpy, script).map_err(|e| format!("write vpy: {}", e))?;
    Ok(vpy.to_string_lossy().into_owned())
}
