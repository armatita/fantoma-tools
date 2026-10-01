-- Test files for Canvas's .aseprite reader (tools/canvas): each exercises
-- something the reader must get right, and Aseprite itself writes them, so
-- they are real files rather than guesses at the format.
--
--   Aseprite.exe -b --script-param out=C:/some/folder --script aseprite_test_files.lua
--
-- Then export each one as a sprite sheet with Aseprite and compare it with
-- Canvas's direct reading (README, Canvas phase 6, "How it was proven").
-- feat_indexed needs an RGB copy for that: an indexed PNG has one
-- transparent index for the whole image, so it cannot show a Background
-- layer's index 0 as a colour.
local dir = app.params["out"] or app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local function path(n) return app.fs.joinPath(dir, n) end
local rgba = app.pixelColor.rgba

local function fill(img, f)
  for y = 0, img.height - 1 do
    for x = 0, img.width - 1 do img:drawPixel(x, y, f(x, y)) end
  end
end

-- 1. RGBA: layer opacity, cel opacity, semi-transparent pixels, a hidden
--    layer, a group, a cel moved down by z-index, varied durations, tags
--    with directions and repeats, a slice.
do
  local spr = Sprite(10, 8, ColorMode.RGB)
  for i = 2, 4 do spr:newEmptyFrame() end
  local base = spr.layers[1]; base.name = "base"
  local mid = spr:newLayer(); mid.name = "mid"; mid.opacity = 128
  local hid = spr:newLayer(); hid.name = "hidden"; hid.isVisible = false
  local grp = spr:newGroup(); grp.name = "grp"
  local inner = spr:newLayer(); inner.name = "inner"; inner.parent = grp
  local top = spr:newLayer(); top.name = "top"
  for f = 1, 4 do
    local a = Image(10, 8, ColorMode.RGB)
    fill(a, function(x, y) return rgba(20 * x + f * 5, 30 * y, 200 - 10 * f, (x + y + f) % 3 == 0 and 0 or 255) end)
    spr:newCel(base, f, a, Point(0, 0))
    local m = Image(6, 4, ColorMode.RGB)
    fill(m, function(x, y) return rgba(250, 40 * x, 60 * y, (x * 50 + 30) % 256) end)
    spr:newCel(mid, f, m, Point(f - 1, 2))
    local h = Image(3, 3, ColorMode.RGB); fill(h, function() return rgba(255, 0, 255, 255) end)
    spr:newCel(hid, f, h, Point(1, 1))
    local i = Image(4, 4, ColorMode.RGB); fill(i, function(x, y) return rgba(10, 200, 10 + 40 * y, 255) end)
    local ic = spr:newCel(inner, f, i, Point(5, 3 - f % 2))
    ic.opacity = 200
    local t = Image(5, 2, ColorMode.RGB); fill(t, function(x) return rgba(255, 255, 0, 255) end)
    local tc = spr:newCel(top, f, t, Point(2, 5))
    if f == 3 then tc.zIndex = -3 end      -- frame 3: drawn under the base
  end
  local ms = { 0.1, 0.15, 0.08, 0.2 }
  for f = 1, 4 do spr.frames[f].duration = ms[f] end
  local t1 = spr:newTag(1, 2); t1.name = "walk"; t1.aniDir = AniDir.PING_PONG
  local t2 = spr:newTag(3, 4); t2.name = "jump"; t2.aniDir = AniDir.REVERSE; t2.repeats = 1
  local sl = spr:newSlice(Rectangle(1, 2, 6, 5)); sl.name = "hitbox"
  spr:saveAs(path("feat_rgba.aseprite"))
  spr:close()
end

-- 2. Indexed: transparent index 0 on a normal layer, a Background layer
--    where index 0 is a real colour, and a linked cel.
do
  local spr = Sprite(8, 6, ColorMode.INDEXED)
  spr:newEmptyFrame(); spr:newEmptyFrame()
  local pal = spr.palettes[1]
  pal:resize(6)
  local cols = { Color(10, 10, 10), Color(200, 50, 50), Color(50, 200, 50), Color(50, 50, 200), Color(240, 240, 240), Color(120, 90, 30) }
  for i = 0, 5 do pal:setColor(i, cols[i + 1]) end
  spr.transparentColor = 0
  local bg = spr.layers[1]; bg.name = "bg"
  for f = 1, 3 do
    local b = Image(8, 6, ColorMode.INDEXED)
    fill(b, function(x, y) return (x + y + f) % 2 == 0 and 0 or 5 end)
    spr:newCel(bg, f, b, Point(0, 0))
  end
  app.activeLayer = bg
  app.command.BackgroundFromLayer()
  local fg = spr:newLayer(); fg.name = "fg"
  local img = Image(5, 3, ColorMode.INDEXED)
  fill(img, function(x, y) return (x + y) % 4 end)      -- index 0 = transparent here
  spr:newCel(fg, 1, img, Point(1, 1))
  local i2 = Image(5, 3, ColorMode.INDEXED); fill(i2, function(x, y) return 4 end)
  spr:newCel(fg, 2, i2, Point(2, 2))
  -- frame 3 shares frame 1's cel (a linked cel)
  app.activeLayer = fg
  app.range:clear()
  app.range.frames = { spr.frames[1], spr.frames[3] }
  app.range.layers = { fg }
  local ok = pcall(function() app.command.LinkCels() end)
  if not ok or not spr.layers[2]:cel(3) then spr:newCel(fg, 3, img, Point(1, 1)) end
  spr:saveAs(path("feat_indexed.aseprite"))
  spr:close()
end

-- 3. Grayscale with alpha.
do
  local spr = Sprite(6, 6, ColorMode.GRAY)
  local img = Image(6, 6, ColorMode.GRAY)
  fill(img, function(x, y) return app.pixelColor.graya(40 * x + 10, (y == 0) and 0 or 255) end)
  spr:newCel(spr.layers[1], 1, img, Point(0, 0))
  spr:saveAs(path("feat_gray.aseprite"))
  spr:close()
end

-- 4. A tilemap layer: 4x4 tiles, some placed flipped.
do
  local spr = Sprite(16, 12, ColorMode.RGB)
  app.command.NewLayer { name = "tiles", tilemap = true, gridBounds = Rectangle(0, 0, 4, 4) }
  local layer = app.activeLayer
  local ts = layer.tileset
  for k = 1, 3 do
    local tile = spr:newTile(ts)
    fill(tile.image, function(x, y) return rgba(60 * k, 20 * x + 40, 50 * y, (x == 3 and y == 0) and 0 or 255) end)
  end
  local map = Image(4, 3, ColorMode.TILEMAP)
  local P = app.pixelColor
  local ids = { 1, 2, 3, 0, 2, 0, 1, 3, 3, 1, 0, 2 }
  for i, id in ipairs(ids) do
    local x, y = (i - 1) % 4, (i - 1) // 4
    local flags = 0
    if i == 2 then flags = 0x80000000 end     -- X flip
    if i == 6 or i == 8 then flags = 0x40000000 end     -- Y flip
    map:drawPixel(x, y, P.tile(id, flags))
  end
  spr:newCel(layer, 1, map, Point(0, 0))
  spr:deleteLayer(spr.layers[1])
  spr:saveAs(path("feat_tiles.aseprite"))
  spr:close()
end

-- 5. A blend mode Canvas does not do: it must be WARNED, and will differ.
do
  local spr = Sprite(4, 4, ColorMode.RGB)
  local a = Image(4, 4, ColorMode.RGB); fill(a, function() return rgba(200, 100, 50, 255) end)
  spr:newCel(spr.layers[1], 1, a, Point(0, 0))
  local m = spr:newLayer(); m.name = "multiply"; m.blendMode = BlendMode.MULTIPLY
  local b = Image(4, 4, ColorMode.RGB); fill(b, function() return rgba(128, 128, 255, 255) end)
  spr:newCel(m, 1, b, Point(0, 0))
  spr:saveAs(path("feat_blend.aseprite"))
  spr:close()
end
