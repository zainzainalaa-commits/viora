use serde::Serialize;

#[derive(Serialize, Default, Clone, Copy)]
pub struct ProcMem {
    #[serde(rename = "harborRss")]
    pub harbor_rss: u64,
    #[serde(rename = "webviewRss")]
    pub webview_rss: u64,
    pub total: u64,
    #[serde(rename = "totalPhys")]
    pub total_phys: u64,
}

#[cfg(windows)]
fn working_set(pid: u32) -> u64 {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return 0;
        };
        let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        let mut rss = 0u64;
        if K32GetProcessMemoryInfo(
            handle,
            &mut counters,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
        .as_bool()
        {
            rss = counters.WorkingSetSize as u64;
        }
        let _ = CloseHandle(handle);
        rss
    }
}

#[cfg(windows)]
fn exe_name(name: &[u16; 260]) -> String {
    let end = name.iter().position(|&c| c == 0).unwrap_or(name.len());
    String::from_utf16_lossy(&name[..end]).to_lowercase()
}

#[cfg(windows)]
fn read() -> ProcMem {
    use std::collections::HashSet;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    use windows::Win32::System::Threading::GetCurrentProcessId;

    let mut out = ProcMem::default();
    let harbor_pid = unsafe { GetCurrentProcessId() };
    out.harbor_rss = working_set(harbor_pid);

    unsafe {
        let mut status: MEMORYSTATUSEX = std::mem::zeroed();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut status).is_ok() {
            out.total_phys = status.ullTotalPhys;
        }
    }

    let snapshot = match unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) } {
        Ok(h) => h,
        Err(_) => {
            out.total = out.harbor_rss + out.webview_rss;
            return out;
        }
    };

    let mut procs: Vec<(u32, u32, String)> = Vec::new();
    unsafe {
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                procs.push((
                    entry.th32ProcessID,
                    entry.th32ParentProcessID,
                    exe_name(&entry.szExeFile),
                ));
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }

    let mut tree: HashSet<u32> = HashSet::new();
    tree.insert(harbor_pid);
    loop {
        let mut added = false;
        for (pid, parent, _) in &procs {
            if tree.contains(parent) && !tree.contains(pid) {
                tree.insert(*pid);
                added = true;
            }
        }
        if !added {
            break;
        }
    }

    for (pid, _, name) in &procs {
        if *pid == harbor_pid {
            continue;
        }
        if tree.contains(pid) && name.contains("webview") {
            out.webview_rss += working_set(*pid);
        }
    }

    out.total = out.harbor_rss + out.webview_rss;
    out
}

#[tauri::command]
pub fn harbor_process_memory() -> ProcMem {
    #[cfg(windows)]
    {
        read()
    }
    #[cfg(not(windows))]
    {
        ProcMem::default()
    }
}
