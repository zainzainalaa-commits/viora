use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use axum::body::Body;
use axum::extract::Request;
use axum::http::{header, Response, StatusCode};
use tauri::AppHandle;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

pub const WEB_PORT: u16 = 11471;

static RUNNING: AtomicBool = AtomicBool::new(false);

fn shutdown_slot() -> &'static Mutex<Option<oneshot::Sender<()>>> {
    static S: OnceLock<Mutex<Option<oneshot::Sender<()>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn serve_asset(app: &AppHandle, raw_path: &str) -> Response<Body> {
    let resolver = app.asset_resolver();
    let path = if raw_path == "/" || raw_path.is_empty() {
        "/index.html".to_string()
    } else {
        raw_path.to_string()
    };
    let asset = resolver
        .get(path.clone())
        .or_else(|| resolver.get("/index.html".to_string()));
    match asset {
        Some(a) => {
            let cache = if path.ends_with(".html") || path == "/index.html" {
                "no-cache"
            } else {
                "public, max-age=31536000, immutable"
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, a.mime_type)
                .header(header::CACHE_CONTROL, cache)
                .body(Body::from(a.bytes))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(
                "Harbor web assets are not available in this build.",
            ))
            .unwrap(),
    }
}

#[tauri::command]
pub async fn web_serve_start(app: AppHandle) -> Result<u16, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(WEB_PORT);
    }
    let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], WEB_PORT)))
        .await
        .map_err(|e| format!("port {} unavailable: {}", WEB_PORT, e))?;
    let (tx, rx) = oneshot::channel::<()>();
    *shutdown_slot().lock().unwrap() = Some(tx);
    RUNNING.store(true, Ordering::SeqCst);
    let app_for_routes = app.clone();
    let router = axum::Router::new().fallback(move |req: Request| {
        let app = app_for_routes.clone();
        async move { serve_asset(&app, req.uri().path()) }
    });
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
        RUNNING.store(false, Ordering::SeqCst);
    });
    eprintln!("[web-serve] Harbor web UI listening on 0.0.0.0:{}", WEB_PORT);
    Ok(WEB_PORT)
}

#[tauri::command]
pub fn web_serve_stop() {
    if let Some(tx) = shutdown_slot().lock().unwrap().take() {
        let _ = tx.send(());
    }
}

#[tauri::command]
pub fn web_serve_status() -> bool {
    RUNNING.load(Ordering::SeqCst)
}
