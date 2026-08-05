use std::collections::HashSet;

pub const ALL: &[&str] = &[
    "https://tracker.zhuqiy.com:443/announce",
    "https://tracker.nekomi.cn:443/announce",
    "https://tracker.gcrenwp.top:443/announce",
    "https://tracker.7471.top:443/announce",
    "https://tracker.leechshield.link:443/announce",
    "https://tracker.pmman.tech:443/announce",
    "https://tr.zukizuki.org:443/announce",
    "https://tr.nyacat.pw:443/announce",
    "https://torrents.tmtime.dev:443/announce",
    "https://t.213891.xyz:443/announce",
    "https://tracker.yemekyedim.com:443/announce",
    "https://tracker.anibt.net:443/announce",
    "https://tracker.manager.v6.navy:443/announce",
    "http://tracker.opentrackr.org:1337/announce",
    "http://bt1.archive.org:6969/announce",
    "http://tracker.mywaifu.best:6969/announce",
    "http://tracker.renfei.net:8080/announce",
    "http://tracker.dhitechnical.com:6969/announce",
    "http://tracker.waaa.moe:6969/announce",
    "http://tracker.tritan.gg:8080/announce",
    "http://tracker.dler.org:6969/announce",
    "http://tracker.qu.ax:6969/announce",
    "http://tracker.bittor.pw:1337/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.dler.org:6969/announce",
    "udp://tracker.qu.ax:6969/announce",
    "udp://tracker-udp.gbitt.info:80/announce",
    "udp://tracker.bittor.pw:1337/announce",
    "udp://bt1.archive.org:6969/announce",
    "udp://exodus.desync.com:6969/announce",
];

pub fn as_url_set() -> HashSet<url::Url> {
    ALL.iter().filter_map(|t| url::Url::parse(t).ok()).collect()
}

pub fn merge_into(mut trackers: Vec<String>) -> Vec<String> {
    for t in ALL {
        let s = t.to_string();
        if !trackers.contains(&s) {
            trackers.push(s);
        }
    }
    trackers
}
