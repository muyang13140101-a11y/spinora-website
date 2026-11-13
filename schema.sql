-- ========================================================
-- Spinora 官方网站与音乐礼物盒子 2.0 - Cloudflare D1 数据表结构
-- ========================================================

CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_title TEXT NOT NULL,                 -- 歌曲名
    artist TEXT DEFAULT '未知艺术家',           -- 歌手名
    message TEXT NOT NULL,                    -- 听歌心情与对拆礼人的祝福
    song_url TEXT DEFAULT '',                 -- 歌曲链接
    nickname TEXT DEFAULT '神秘访客',          -- 送礼人昵称
    sender_email TEXT DEFAULT '',             -- 送礼人邮箱 (选填，当礼物被拆开并收到回信时通知)
    album_cover TEXT DEFAULT '',              -- 专辑封面图直链
    preview_url TEXT DEFAULT '',              -- 官方高保真 30 秒试听原声直链
    platform_links TEXT DEFAULT '{}',         -- 各大平台直达跳转 JSON (Spotify, 网易云, QQ, 酷狗, Apple Music)
    likes_count INTEGER DEFAULT 0,            -- 拆礼人送出的共鸣爱心数
    reply_message TEXT DEFAULT '',            -- 拆礼人的感动回信
    ip_hash TEXT NOT NULL,                    -- 客户端 IP 哈希 (防刷保护)
    status TEXT DEFAULT 'active',             -- 状态: active, hidden
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引构建加速随机读取与风控检测
CREATE INDEX IF NOT EXISTS idx_gifts_status ON gifts(status);
CREATE INDEX IF NOT EXISTS idx_gifts_created_at ON gifts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_ip_time ON gifts(ip_hash, created_at DESC);

-- ========================================================
-- 若已创建过老版 gifts 表，可在 D1 控制台执行以下升级语句：
-- ALTER TABLE gifts ADD COLUMN sender_email TEXT DEFAULT '';
-- ALTER TABLE gifts ADD COLUMN album_cover TEXT DEFAULT '';
-- ALTER TABLE gifts ADD COLUMN preview_url TEXT DEFAULT '';
-- ALTER TABLE gifts ADD COLUMN platform_links TEXT DEFAULT '{}';
-- ALTER TABLE gifts ADD COLUMN likes_count INTEGER DEFAULT 0;
-- ALTER TABLE gifts ADD COLUMN reply_message TEXT DEFAULT '';
-- ========================================================
