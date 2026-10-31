use std::{io::Read, path::PathBuf, sync::LazyLock, time::Duration};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use reqwest::Url;
use serde_json::Value;

use crate::error::Result;

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(5))
        .user_agent("SeelenUI QQ lyrics")
        .build()
        .expect("failed to build QQ lyrics client")
});

fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn normalize_artists(value: &str) -> Vec<String> {
    value
        .split(|c: char| matches!(c, '&' | '、' | ',' | '，' | '/'))
        .map(normalize)
        .filter(|artist| !artist.is_empty())
        .collect()
}

fn local_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(app_data) = std::env::var_os("APPDATA") {
        let root = PathBuf::from(app_data);
        if let Ok(ini) = std::fs::read_to_string(root.join("Tencent/QQMusic/WebkitCachePath.ini")) {
            for line in ini.lines() {
                if let Some(value) = line.trim().strip_prefix("Path=") {
                    if let Some(parent) = PathBuf::from(value.trim()).parent() {
                        roots.push(parent.join("QQMusicLyricNew"));
                    }
                }
            }
        }
        roots.push(root.join("Tencent/QQMusic/QQMusicCache/QQMusicLyricNew"));
        roots.push(root.join("Tencent/QQMusic/QQMusicLyricNew"));
    }
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        let root = PathBuf::from(local_app_data);
        roots.push(root.join("Tencent/QQMusic/QQMusicLyricNew"));
    }
    roots
}

fn read_local_lrc(title: &str, author: &str) -> Option<String> {
    let title_key = normalize(title);
    let author_key = author.trim();
    if title_key.is_empty() {
        return None;
    }

    for root in local_roots() {
        if !root.is_dir() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(root) else {
            continue;
        };
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default();
            if !entry.file_type().is_ok_and(|kind| kind.is_file())
                || !(extension.eq_ignore_ascii_case("lrc") || extension.eq_ignore_ascii_case("qrc"))
            {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            let title_matches = local_filename_matches(stem, &title_key, &author_key);
            if title_matches {
                if extension.eq_ignore_ascii_case("qrc") {
                    if let Some(lrc) = decode_local_qrc(&path) {
                        return Some(lrc);
                    }
                    continue;
                }
                if let Some(content) = read_bounded_text(&path, 512 * 1024) {
                    if content.contains('[') {
                        return Some(content);
                    }
                }
            }
        }
    }
    None
}

fn local_filename_matches(stem: &str, title: &str, author: &str) -> bool {
    if title.is_empty() {
        return false;
    }
    let stem_key = normalize(stem);
    // QQ's `_qmts` files hold translated lyrics. Never treat them as the original track.
    if stem_key.ends_with("qmts") {
        return false;
    }

    // QQ cache naming: artist - title - duration - album_qm. Compare version title exactly.
    let fields: Vec<&str> = stem.splitn(4, " - ").collect();
    if fields.len() == 4 {
        let track_title = normalize(fields[1]);
        let cache_artists = normalize_artists(fields[0]);
        let requested_artists = normalize_artists(author);
        let artists_match = requested_artists.is_empty()
            || requested_artists
                .iter()
                .all(|artist| cache_artists.iter().any(|cache| cache == artist));
        return track_title == title && artists_match;
    }

    // Permit simple exact title/artist filenames used by some cache versions.
    if author.is_empty() {
        return normalize(stem) == title;
    }
    false
}

fn read_bounded_text(path: &std::path::Path, max_bytes: u64) -> Option<String> {
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > max_bytes {
        return None;
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    std::fs::File::open(path)
        .ok()?
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > max_bytes {
        return None;
    }
    String::from_utf8(bytes).ok()
}

// QQMusicMonitor's MIT-licensed QQ DES implementation and local cache format.
// Attribution and license: vendor/qq-qrc/LICENSE.
unsafe extern "C" {
    fn Ddes(buffer: *mut u8, key: *mut u8, length: i32) -> i32;
    fn des(buffer: *mut u8, key: *mut u8, length: i32) -> i32;
}

fn decode_local_qrc(path: &std::path::Path) -> Option<String> {
    const KEY: [u8; 128] = [
        0xc3, 0x4a, 0xd6, 0xca, 0x90, 0x67, 0xf7, 0x52, 0xd8, 0xa1, 0x66, 0x62, 0x9f, 0x5b, 0x09,
        0x00, 0xc3, 0x5e, 0x95, 0x23, 0x9f, 0x13, 0x11, 0x7e, 0xd8, 0x92, 0x3f, 0xbc, 0x90, 0xbb,
        0x74, 0x0e, 0xc3, 0x47, 0x74, 0x3d, 0x90, 0xaa, 0x3f, 0x51, 0xd8, 0xf4, 0x11, 0x84, 0x9f,
        0xde, 0x95, 0x1d, 0xc3, 0xc6, 0x09, 0xd5, 0x9f, 0xfa, 0x66, 0xf9, 0xd8, 0xf0, 0xf7, 0xa0,
        0x90, 0xa1, 0xd6, 0xf3, 0xc3, 0xf3, 0xd6, 0xa1, 0x90, 0xa0, 0xf7, 0xf0, 0xd8, 0xf9, 0x66,
        0xfa, 0x9f, 0xd5, 0x09, 0xc6, 0xc3, 0x1d, 0x95, 0xde, 0x9f, 0x84, 0x11, 0xf4, 0xd8, 0x51,
        0x3f, 0xaa, 0x90, 0x3d, 0x74, 0x47, 0xc3, 0x0e, 0x74, 0xbb, 0x90, 0xbc, 0x3f, 0x92, 0xd8,
        0x7e, 0x11, 0x13, 0x9f, 0x23, 0x95, 0x5e, 0xc3, 0x00, 0x09, 0x5b, 0x9f, 0x62, 0x66, 0xa1,
        0xd8, 0x52, 0xf7, 0x67, 0x90, 0xca, 0xd6, 0x4a,
    ];
    const MAX_QRC_BYTES: u64 = 512 * 1024;
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() < 19 || metadata.len() > MAX_QRC_BYTES {
        return None;
    }
    let mut raw = Vec::with_capacity(metadata.len() as usize);
    std::fs::File::open(path)
        .ok()?
        .take(MAX_QRC_BYTES + 1)
        .read_to_end(&mut raw)
        .ok()?;
    if raw.len() as u64 > MAX_QRC_BYTES {
        return None;
    }
    let mut bytes: Vec<u8> = if raw.starts_with(&[
        0x98, 0x25, 0xb0, 0xac, 0xe3, 0x02, 0x83, 0x68, 0xe8, 0xfc, 0x6c,
    ]) {
        raw.iter()
            .enumerate()
            .map(|(i, byte)| byte ^ KEY[(if i <= 0x7fff { i } else { i % 0x7fff }) & 127])
            .skip(11)
            .collect()
    } else {
        return None;
    };
    if bytes.len() % 8 != 0 {
        return None;
    }
    let length = bytes.len() as i32;
    let mut key1 = *b"!@#)(NHL";
    let mut key2 = *b"123ZXC!@";
    let mut key3 = *b"!@#)(*$%";
    unsafe {
        Ddes(bytes.as_mut_ptr(), key1.as_mut_ptr(), length);
        des(bytes.as_mut_ptr(), key2.as_mut_ptr(), length);
        Ddes(bytes.as_mut_ptr(), key3.as_mut_ptr(), length);
    }
    let mut xml = String::new();
    flate2::read::ZlibDecoder::new(bytes.as_slice())
        .take(MAX_QRC_BYTES + 1)
        .read_to_string(&mut xml)
        .ok()?;
    if xml.len() as u64 > MAX_QRC_BYTES {
        return None;
    }
    let start = xml.find("LyricContent=\"")? + "LyricContent=\"".len();
    let end = xml[start..].rfind("\"/>")? + start;
    let text = xml[start..end]
        .replace("&#10;", "\n")
        .replace("&#13;", "")
        .replace("&quot;", "\"")
        .replace("&amp;", "&");
    let times = regex::Regex::new(r"(?m)^\[(\d+),(\d+)\]").ok()?;
    let words = regex::Regex::new(r"\(\d+,\d+\)").ok()?;
    let text = words.replace_all(&text, "");
    Some(
        times
            .replace_all(&text, |caps: &regex::Captures| {
                let ms: u64 = caps[1].parse().unwrap_or(0);
                format!(
                    "[{:02}:{:02}.{:03}]",
                    ms / 60000,
                    (ms / 1000) % 60,
                    ms % 1000
                )
            })
            .into_owned(),
    )
}

async fn search_song_mid(title: &str, author: &str) -> Result<Option<String>> {
    let keyword = format!("{} {}", author.trim(), title.trim())
        .trim()
        .to_string();
    if keyword.is_empty() {
        return Ok(None);
    }
    let url = Url::parse_with_params(
        "https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg",
        [("key", keyword.as_str()), ("format", "json")],
    )
    .map_err(|error| format!("QQ lyrics search URL error: {error}"))?;
    let body: Value = HTTP_CLIENT
        .get(url)
        .header("Referer", "https://y.qq.com/")
        .send()
        .await?
        .json()
        .await?;
    let artist_key = normalize(author);
    let title_key = normalize(title);
    if let Some(items) = body["data"]["song"]["itemlist"].as_array() {
        for item in items {
            let mid = item["mid"].as_str().unwrap_or_default();
            if mid.is_empty() {
                continue;
            }
            if normalize(item["name"].as_str().unwrap_or_default()) != title_key {
                continue;
            }
            let singer = normalize(item["singer"].as_str().unwrap_or_default());
            if artist_key.is_empty()
                || singer.is_empty()
                || singer.contains(&artist_key)
                || artist_key.contains(&singer)
            {
                return Ok(Some(mid.to_string()));
            }
        }
    }
    Ok(None)
}

async fn fetch_online_lrc(title: &str, author: &str) -> Result<Option<String>> {
    let Some(song_mid) = search_song_mid(title, author).await? else {
        return Ok(None);
    };
    let payload = serde_json::json!({
        "comm": {
            "cv": 4747474,
            "ct": 24,
            "format": "json",
            "inCharset": "utf-8",
            "outCharset": "utf-8",
            "notice": 0,
            "platform": "yqq.json",
            "needNewCode": 1,
            "uin": 0
        },
        "req_1": {
            "module": "music.musichallSong.PlayLyricInfo",
            "method": "GetPlayLyricInfo",
            "param": {"songMID": song_mid, "songID": 0, "qrc": 0, "trans": 0, "roma": 0}
        }
    });
    let body: Value = HTTP_CLIENT
        .post("https://u.y.qq.com/cgi-bin/musicu.fcg")
        .header("Referer", "https://y.qq.com/")
        .json(&payload)
        .send()
        .await?
        .json()
        .await?;
    let encoded = body["req_1"]["data"]["lyric"].as_str().unwrap_or_default();
    if encoded.is_empty() {
        return Ok(None);
    }
    let decoded = STANDARD
        .decode(encoded)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok());
    Ok(decoded.filter(|text| text.contains('[')))
}

impl crate::tauri_handlers::Handlers {
    pub async fn get_qq_lyrics(title: String, author: String) -> Result<Option<String>> {
        if title.trim().is_empty() || title.len() > 2048 || author.len() > 2048 {
            return Ok(None);
        }
        if let Some(local) = read_local_lrc(&title, &author) {
            log::debug!("QQ lyrics loaded from local cache ({} bytes)", local.len());
            return Ok(Some(local));
        }
        // QQ can publish the media event before it finishes writing its cache.
        // These retries exist only for this request, never as an idle poller.
        for _ in 0..3 {
            tokio::time::sleep(Duration::from_millis(300)).await;
            if let Some(local) = read_local_lrc(&title, &author) {
                log::debug!(
                    "QQ lyrics loaded after local cache write ({} bytes)",
                    local.len()
                );
                return Ok(Some(local));
            }
        }
        log::debug!("QQ lyrics cache miss; requesting QQ lyric service");
        fetch_online_lrc(&title, &author).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_filename_matching_uses_exact_version_title_and_artist_fields() {
        let title = normalize("Blue-Edit");
        let artist = "Artist_One";
        assert!(local_filename_matches(
            "Artist_One - Blue-Edit - 238 - Album_qm",
            &title,
            &artist
        ));
        assert!(!local_filename_matches(
            "Artist_One - Blue - 238 - Album_qm",
            &title,
            &artist
        ));
        assert!(!local_filename_matches(
            "Artist_One - Blue-Edit - 238 - Album_qmts",
            &title,
            &artist
        ));
        assert!(!local_filename_matches(
            "Artist_One - Blue-Edit (Live) - 238 - Album_qm",
            &title,
            &artist
        ));
        assert!(!local_filename_matches(
            "Artist_One - Blue-Edit - 238 - Album_qm",
            "",
            &artist
        ));
    }

    #[test]
    fn local_filename_matching_supports_multiple_artists_without_substrings() {
        let title = normalize("Song");
        let artists = "Alpha & Beta";
        assert!(local_filename_matches(
            "Alpha、Beta - Song - 200 - Album_qm",
            &title,
            &artists
        ));
        assert!(!local_filename_matches(
            "Alphabet、Betamax - Song - 200 - Album_qm",
            &title,
            &artists
        ));
    }

    #[test]
    fn bounded_text_rejects_oversized_files() {
        let path =
            std::env::temp_dir().join(format!("slu-lyrics-boundary-{}.lrc", std::process::id()));
        assert!(std::fs::write(&path, b"12345").is_ok());
        assert!(read_bounded_text(&path, 4).is_none());
        assert!(read_bounded_text(&path, 5).is_some());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn configured_qrc_cache_smoke_reports_counts_only() {
        let Some(root) = local_roots().into_iter().find(|root| root.is_dir()) else {
            eprintln!("QQ QRC smoke: no local cache; skipped");
            return;
        };
        let mut checked = 0usize;
        let mut decoded_with_timestamps = 0usize;
        let Ok(entries) = std::fs::read_dir(root) else {
            return;
        };
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            let filename = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            if !filename.ends_with("_qm.qrc") || filename.ends_with("_qmts.qrc") {
                continue;
            }
            checked += 1;
            if decode_local_qrc(&path).is_some_and(|lyric| {
                lyric.lines().any(|line| {
                    line.starts_with('[')
                        && line.as_bytes().get(3) == Some(&b':')
                        && line.as_bytes().get(6) == Some(&b'.')
                })
            }) {
                decoded_with_timestamps += 1;
            }
        }
        eprintln!(
            "QQ QRC smoke: checked={checked}, decoded_with_timestamps={decoded_with_timestamps}"
        );
    }
}
