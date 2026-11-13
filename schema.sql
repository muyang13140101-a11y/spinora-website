-- ========================================================
-- Spinora 官方网站与音乐礼物盒子 - Cloudflare D1 数据表结构
-- ========================================================

CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_title TEXT NOT NULL,                 -- 歌曲名 (1-100字)
    artist TEXT DEFAULT '未知艺术家',           -- 歌手名 (0-100字)
    message TEXT NOT NULL,                    -- 推荐语与听歌心情 (1-300字)
    song_url TEXT DEFAULT '',                 -- 歌曲合法链接 (音频直链或合规音乐平台主页链接)
    nickname TEXT DEFAULT '神秘访客',          -- 留下礼物的人昵称 (0-30字)
    ip_hash TEXT NOT NULL,                    -- 客户端 IP 哈希加盐 (用于防恶意脚本刷屏限流)
    status TEXT DEFAULT 'active',             -- 状态: active(正常展示), hidden(涉及侵权/违规屏蔽)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 留存时间戳
);

-- 索引构建加速随机读取与风控检测
CREATE INDEX IF NOT EXISTS idx_gifts_status ON gifts(status);
CREATE INDEX IF NOT EXISTS idx_gifts_created_at ON gifts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_ip_time ON gifts(ip_hash, created_at DESC);

-- 初始合规引导礼物
INSERT INTO gifts (song_title, artist, message, song_url, nickname, ip_hash) 
VALUES (
    'Hotel California (Live)',
    'Eagles',
    '欢迎来到 Spinora 公益音乐礼物盒子。在这里，我们分享打动人心的旋律与真诚的心情。戴上耳机，享受纯粹的声场与吉他。',
    'https://open.spotify.com/track/2JYKsHjS3b1kR5N17v75wJ',
    'Spinora 守护者',
    'system_init'
);
