// functions/api/search.js
// GET /api/search?q={keyword}&source={all|qq|netease|kugou|deezer}
// 多平台聚合音乐检索接口 (并发请求 + 超时保护 + 标准化输出)

function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function buildPlatformLinks(title, artist, overrides = {}) {
  const query = encodeURIComponent(`${title} ${artist}`.trim());
  return {
    spotify: overrides.spotify || `https://open.spotify.com/search/${query}`,
    netease: overrides.netease || `https://music.163.com/#/search/m/?s=${query}`,
    qq: overrides.qq || `https://y.qq.com/n/ryqq/search?w=${query}`,
    kugou: overrides.kugou || `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${query}`,
    apple: overrides.apple || `https://music.apple.com/search?term=${query}`,
    tidal: overrides.tidal || `https://listen.tidal.com/search?q=${query}`
  };
}

async function searchQQ(q) {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=6&w=${encodeURIComponent(q)}&format=json`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://y.qq.com/"
    }
  });
  if (!res.ok) return [];
  const data = await res.json();
  const list = data?.data?.song?.list || [];
  return list.map(item => {
    const title = item.songname || "";
    const artist = (item.singer || []).map(s => s.name).join(" / ") || "未知歌手";
    const album = item.albumname || "";
    const cover = item.albummid
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${item.albummid}.jpg`
      : "";
    const qqLink = item.songmid
      ? `https://y.qq.com/n/ryqq/songDetail/${item.songmid}`
      : "";
    return {
      id: `qq_${item.songmid || item.songid}`,
      source: "qq",
      source_label: "QQ音乐",
      title,
      artist,
      album,
      cover,
      preview_url: "",
      platform_links: buildPlatformLinks(title, artist, { qq: qqLink })
    };
  });
}

async function searchNetease(q) {
  const url = `https://music.163.com/api/search/get?s=${encodeURIComponent(q)}&type=1&limit=6`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://music.163.com/"
    }
  });
  if (!res.ok) return [];
  const data = await res.json();
  const songs = data?.result?.songs || [];
  return songs.map(item => {
    const title = item.name || "";
    const artist = (item.artists || []).map(a => a.name).join(" / ") || "未知歌手";
    const album = item.album?.name || "";
    const cover = item.album?.picUrl || item.artists?.[0]?.img1v1Url || "";
    const neteaseLink = item.id ? `https://music.163.com/#/song?id=${item.id}` : "";
    return {
      id: `ncm_${item.id}`,
      source: "netease",
      source_label: "网易云",
      title,
      artist,
      album,
      cover: cover ? cover.replace("http://", "https://") : "",
      preview_url: "",
      platform_links: buildPlatformLinks(title, artist, { netease: neteaseLink })
    };
  });
}

async function searchKugou(q) {
  const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(q)}&page=1&pagesize=6`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return [];
  const data = await res.json();
  const lists = data?.data?.lists || [];
  return lists.map(item => {
    const title = (item.SongName || "").replace(/<\/?em>/g, "");
    const artist = (item.SingerName || "").replace(/<\/?em>/g, "") || "未知歌手";
    const album = (item.AlbumName || "").replace(/<\/?em>/g, "");
    return {
      id: `kg_${item.FileHash || Math.random()}`,
      source: "kugou",
      source_label: "酷狗音乐",
      title,
      artist,
      album,
      cover: "",
      preview_url: "",
      platform_links: buildPlatformLinks(title, artist)
    };
  });
}

async function searchDeezer(q) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=6`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return [];
  const data = await res.json();
  const list = data?.data || [];
  return list.map(item => {
    const title = item.title || "";
    const artist = item.artist?.name || "未知歌手";
    const album = item.album?.title || "";
    const cover = item.album?.cover_big || item.album?.cover_medium || "";
    return {
      id: `dz_${item.id}`,
      source: "deezer",
      source_label: "全球曲库",
      title,
      artist,
      album,
      cover,
      preview_url: item.preview || "",
      platform_links: buildPlatformLinks(title, artist)
    };
  });
}

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const source = (url.searchParams.get("source") || "all").toLowerCase();

    if (!q) {
      return new Response(JSON.stringify({ code: 400, message: "搜索关键词不能为空", data: [] }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    const tasks = [];
    if (source === "all" || source === "qq") tasks.push(searchQQ(q));
    if (source === "all" || source === "deezer") tasks.push(searchDeezer(q));
    if (source === "all" || source === "netease") tasks.push(searchNetease(q));
    if (source === "all" || source === "kugou") tasks.push(searchKugou(q));

    const settled = await Promise.allSettled(tasks);
    const buckets = settled
      .filter(r => r.status === "fulfilled" && Array.isArray(r.value))
      .map(r => r.value);

    // 交错合并多平台结果，保证各平台优质结果都有曝光，同时去重（同歌名+同歌手优先保留带封面/试听的）
    const merged = [];
    const seen = new Map();
    const maxLen = Math.max(0, ...buckets.map(b => b.length));

    for (let i = 0; i < maxLen; i++) {
      for (const bucket of buckets) {
        if (i < bucket.length) {
          const item = bucket[i];
          const key = `${item.title.toLowerCase()}__${item.artist.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.set(key, merged.length);
            merged.push(item);
          } else {
            // 如果新结果有试听或封面而旧结果没有，补充进去
            const existingIdx = seen.get(key);
            if (!merged[existingIdx].preview_url && item.preview_url) {
              merged[existingIdx].preview_url = item.preview_url;
            }
            if (!merged[existingIdx].cover && item.cover) {
              merged[existingIdx].cover = item.cover;
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      code: 200,
      data: merged.slice(0, 12)
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=180"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      code: 500,
      message: "音乐搜索服务异常",
      error: err.message,
      data: []
    }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
