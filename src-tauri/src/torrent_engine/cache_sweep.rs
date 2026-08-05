use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const KEEP: &[&str] = &["dht.json", "engine.json"];

pub fn run(dir: &Path, retention_hours: u64, max_gb: u64) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let now = SystemTime::now();
    let max_age = Duration::from_secs(retention_hours.saturating_mul(3600));
    let mut kept: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let keep_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| KEEP.contains(&n))
            .unwrap_or(false);
        if keep_name {
            continue;
        }
        let modified = entry.metadata().and_then(|m| m.modified()).ok();
        let expired = if retention_hours == 0 {
            true
        } else {
            match modified {
                Some(m) => now.duration_since(m).map(|age| age >= max_age).unwrap_or(true),
                None => true,
            }
        };
        if expired {
            remove(&path);
            continue;
        }
        if max_gb > 0 {
            let size = entry_size(&path);
            kept.push((path, modified.unwrap_or(now), size));
        }
    }
    enforce_size_cap(kept, max_gb);
}

fn enforce_size_cap(mut kept: Vec<(PathBuf, SystemTime, u64)>, max_gb: u64) {
    if max_gb == 0 {
        return;
    }
    let cap = max_gb.saturating_mul(1024 * 1024 * 1024);
    let mut total: u64 = kept.iter().map(|(_, _, s)| *s).sum();
    if total <= cap {
        return;
    }
    kept.sort_by_key(|(_, m, _)| *m);
    for (path, _, size) in kept {
        if total <= cap {
            break;
        }
        remove(&path);
        total = total.saturating_sub(size);
    }
}

fn entry_size(path: &Path) -> u64 {
    if path.is_dir() {
        match fs::read_dir(path) {
            Ok(entries) => entries.flatten().map(|e| entry_size(&e.path())).sum(),
            Err(_) => 0,
        }
    } else {
        fs::metadata(path).map(|m| m.len()).unwrap_or(0)
    }
}

fn remove(path: &Path) {
    let _ = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
}
