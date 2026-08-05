use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchArgs {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub content_type: Option<String>,
}

#[tauri::command]
pub async fn harbor_fetch(args: HarborFetchArgs) -> Result<HarborFetchResponse, String> {
    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(30_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .no_proxy()
        .build()
        .map_err(|e| format!("client: {}", e))?;

    let method = args
        .method
        .as_deref()
        .unwrap_or("GET")
        .to_uppercase();
    let parsed_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("method: {}", e))?;

    let mut req = client.request(parsed_method, &args.url);

    let mut has_user_agent = false;
    if let Some(headers) = args.headers {
        for (k, v) in headers {
            if k.eq_ignore_ascii_case("user-agent") {
                has_user_agent = true;
            }
            req = req.header(k, v);
        }
    }
    if !has_user_agent {
        req = req.header("User-Agent", BROWSER_UA);
    }
    req = req.header("Accept", "application/json, text/plain, */*");
    req = req.header("Accept-Language", "en-US,en;q=0.9");

    if let Some(body) = args.body {
        req = req.body(body);
    }

    let res = req.send().await.map_err(|e| format!("send: {}", e))?;
    let status = res.status().as_u16();
    let ok = res.status().is_success();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body = res.text().await.unwrap_or_default();

    Ok(HarborFetchResponse {
        status,
        ok,
        body,
        content_type,
    })
}
