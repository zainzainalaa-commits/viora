use std::path::PathBuf;
use tauri::Manager;

fn has_font(dir: &std::path::Path) -> bool {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return false;
    };
    rd.flatten().any(|e| {
        let p = e.path();
        let ext = p
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        matches!(ext.as_str(), "otf" | "ttf" | "ttc")
    })
}

pub fn locate_fonts_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut cands: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        cands.push(res.join("fonts"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            cands.push(dir.join("fonts"));
            cands.push(dir.join("..").join("fonts"));
            cands.push(dir.join("..").join("..").join("fonts"));
            cands.push(
                dir.join("..")
                    .join("..")
                    .join("..")
                    .join("src-tauri")
                    .join("fonts"),
            );
        }
    }
    cands.push(PathBuf::from("src-tauri").join("fonts"));
    cands.push(PathBuf::from("fonts"));
    cands.into_iter().find(|d| d.is_dir() && has_font(d))
}
