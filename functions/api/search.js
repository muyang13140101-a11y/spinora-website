// functions/api/search.js
// GET /api/search?q={keyword} - 多平台音乐智能聚合搜索与元数据补全

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";

    if (!q.trim()) {
      return new Response(JSON.stringify({ code: 400, message: "搜索关键词不能为空", data: [] }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // 优先调用全球最大的开放音乐检索与高清原声 CDN (iTunes/Apple Music Search API)
    // 免费、无需密钥、响应极速、自带 600x600 极清封面与 30s 官方原声高保真试听
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q.trim())}&entity=song&limit=10`;
    
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ code: 502, message: "搜索服务暂不可用", data: [] }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    const data = await response.json();
    const results = (data.results || []).map(track => {
      const title = track.trackName || "";
      const artist = track.artistName || "";
      const album = track.collectionName || "";
      const queryCombined = encodeURIComponent(`${title} ${artist}`);
      
      // 提取 600x600 高清大图
      let coverUrl = track.artworkUrl100 || "";
      if (coverUrl.includes("100x100bb")) {
        coverUrl = coverUrl.replace("100x100bb", "600x600bb");
      }

      return {
        id: track.trackId,
        title: title,
        artist: artist,
        album: album,
        cover: coverUrl,
        preview_url: track.previewUrl || "",
        release_date: (track.releaseDate || "").slice(0, 10),
        // 自动生成全平台听歌跳链
        platform_links: {
          spotify: `https://open.spotify.com/search/${queryCombined}`,
          netease: `https://music.163.com/#/search/m/?s=${queryCombined}`,
          qq: `https://y.qq.com/n/ryqq/search?w=${queryCombined}`,
          kugou: `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${queryCombined}`,
          apple: track.trackViewUrl || `https://music.apple.com/search?term=${queryCombined}`,
          tidal: `https://listen.tidal.com/search?q=${queryCombined}`
        }
      };
    });

    return new Response(JSON.stringify({
      code: 200,
      data: results
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      code: 500,
      message: "音乐搜索服务异常",
      error: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
