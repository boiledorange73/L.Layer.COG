// 最南端: 沖ノ鳥島 20°25′31″→ 20.4252777778 → 20.4
// 最西端: 与那国島	122°55′57″→ 122.9325 → 122.9
// 最北端: 択捉島	45°33′26″→ 45.5572222222 → 45.6
// 最東端: 南鳥島	153°59′12″→ 153.986666667 → 154.0
window.addEventListener("load", function() {
  // 2024-04-01 Modified: Adds GSI layers.
  var baseMaps = {
    "OpenStreetMap": L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        "maxZoom": 19,
        "attribution": "&copy; <a href=\"http://www.openstreetmap.org/copyright\">OpenStreetMap</a>"
      }
    ),
    "地理院地図": L.tileLayer(
      "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
        "maxZoom": 18,
        "attribution": "<a href=\"https://maps.gsi.go.jp/development/ichiran.html\" target=\"_blank\">地理院タイル</a>"
      }
    ),
    "地理院淡色地図": L.tileLayer(
      "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
        "maxZoom": 18,
        "attribution": "<a href=\"https://maps.gsi.go.jp/development/ichiran.html\" target=\"_blank\">地理院タイル</a>"
      }
    ),
    "地理院空中写真": L.tileLayer(
      "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", {
        "maxZoom": 18,
        "attribution": "<a href=\"https://maps.gsi.go.jp/development/ichiran.html\" target=\"_blank\">地理院タイル</a>"
      }
    )
  };
  // overlays
  // cog = BO.L.layer.cog("https://boiledorange73.sakura.ne.jp/data/cog-tokyo5000-3857.tif", 4);
  cog_kanto_rapid_3857 = BO.L.layer.cog(
      "https://boiledorange73.sakura.ne.jp/data/cog-kanto_rapid-3857.tif",
      3,
      {
          // "fillValue": 255,
          // "nodata": [255,255,255]
      }
  );
  cog_tokyo5000_3857 = BO.L.layer.cog(
      "https://boiledorange73.sakura.ne.jp/data/cog-tokyo5000-3857.tif",
      4
  );

  var overlays = {
      "東京5000": cog_tokyo5000_3857,
      "迅速測図": cog_kanto_rapid_3857,
  };
  // Creates the map instance.
  var map = L.map('MAP', {
    "layers": [baseMaps["地理院淡色地図"], cog_kanto_rapid_3857, cog_tokyo5000_3857],
    "maxZoom": 18,
  });
  // Adds layer control
  var layercontrol = L.control.layers(baseMaps, overlays).addTo(map);
  // Sets view.
  // map.setView([35.687271203860114, 139.76957213401178], 9);
  map.fitBounds([[34.8595, 138.9469],[36.4655, 140.8803]]);
});
