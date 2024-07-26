(function(global) {
    "use strict";
    if( !global.BO ) {
        global.BO = {};
    }
    var BO = global.BO;
    //
    if( !BO.L ) {
        BO.L = {};
    }
    if( !BO.L.Layer ) {
        BO.L.Layer = {};
    }

    //
    // based on: https://qiita.com/shi-works/items/a2e68c077c801b409563
    //

    /**
     * COG Request
     * @param tiff GeoTIFF instance.
     * @param poffset [offset x, offset y] in pixels.
     * @param psize [width, height] in pixels.
     * @param bbox Boundary box in CRS unit.
     * @param bands Bands of the geotiff.
     * @paran canvas "canvas" DOM instance.
     * @param fillValue fillValue used for GeoTIFF::readRasters().
     * @param nodata [nodata band1, nodata band2, ...].
     */
    function CogRequest(tiff, poffset, psize, bbox, bands, canvas, fillValue, nodata) {
        // members
        this._status = 0; // status=0 (none)
        this._tiff = tiff;
        this._pox = poffset[0];
        this._poy = poffset[1];
        this._pw = psize[0];
        this._ph = psize[1];
        this._bbox = bbox;
        this._bands = bands;
        this._canvas = canvas;
        this._fillValue = fillValue;
        this._nodata = nodata;
        this._available_nodata_len = this._nodata && this._bands && this._nodata.length == this._bands.length ? this._nodata.length : -1;
    };

    /**
     * Called when requested image loaded.
     * @param data NumberArray including value of pixels
     */
    CogRequest.prototype.onload = function onload(data) {
        if( this._bands.length == 3 ) {
            // rgb -> rgba
            var chunklen = data.length / 3;
            var newdata = new Uint8Array(chunklen*4);
            for( var n = chunklen - 1; n >= 0; n-- ) {
                newdata[n*4] = data[n*3];
                newdata[n*4+1] = data[n*3+1];
                newdata[n*4+2] = data[n*3+2];
                newdata[n*4+3] = 255;
            }
            data = newdata;
            newdata = null; // purged
        }
        // nodata
        if( this._bands.length == this._available_nodata_len ) {
            var f_nodata;
            for( var n = 0; n < data.length; n += 4 ) {
                f_nodata = true;
                for( var m = 0; m < this._available_nodata_len; m++ ) {
                    if( data[n+m] != this._nodata[m] ) {
                        f_nodata = false;
                        break;
                    }
                }
                if( f_nodata ) {
                    data[n+3] = 0;
                }
            }
        }
        var image = new ImageData(
            new Uint8ClampedArray(data),
            this._pw,
            this._ph
        );
        if( this._status == 1 ) {
            var ctx = this._canvas.getContext('2d');
            ctx.clearRect(0, 0, this._pw, this._ph);
            ctx.putImageData(image, this._pox, this._poy);
        }
        this._status = 0; // status = 0 (none)
    };
    /**
     * Starts loading.
     */
    CogRequest.prototype.run = async function run() {
        if( !this._tiff ) {
            return null;
        }
        // ready to read GeoTIFF
        // creates "pool"
        var pool = new GeoTIFF.Pool();
        // read images (bands)
        var opts = {
            "bbox": this._bbox,
            "samples": this._bands,
            "width": this._pw,
            "height": this._ph,
            "interleave": true, // [r0, g0, b0, a0, r1, b1, b1, a1, ...]
            "pool": pool, // decoder
            "fillValue": this._fillValue,
        };
        var onload = function(_this) {
            return function onload(data) {
                _this.onload(data);
            };
        }(this);
        this._tiff.readRasters(opts).then(onload);
        // started
        this._status = 1; // status=1 (running)
    };
    /**
     * Cancels the request.
     */
    CogRequest.prototype.cancel = function() {
        this._status = 10; // status = 10 (canceled)
    };
    /**
     * COG Layer
     */
    BO.L.Layer.COG = L.Layer.extend({
        "options": {
            "opacity": 1.0,
            "fillValue": null,
            "nodata": null,
        },
        "initialize": function initialize(url, bands, options) {
            L.Util.setOptions(this, options);
            this._url = url;
            this._tiff = null;
            GeoTIFF.fromUrl(this._url).then(
                function(_this) { return function (tiff) {
                    if( !tiff ) {
                        _this._tiff = null;
                        return;
                    }
                    tiff.getImage().then(function(firstImage) {
                        _this._tiff_bbox = firstImage.getBoundingBox();
                        _this._tiff_res = firstImage.getResolution();
                        // all done.
                        _this._tiff = tiff;
                        _this._draw();
                    });
                };}(this)
            );
            this._bands = [0, 1, 2]; // default
            this.bands(bands);
        },
        "bands": function bands(value) {
            if( arguments && arguments.length >= 1 ) {
                // setter
                if( Object.prototype.toString.call(value) === "[object Array]" ) {
                    this._bands = value;
                }
                else if( (value = parseInt(value)), (!isNaN(value) && value >= 1 ) ) {
                    this._bands = [];
                    for( var n = 0; n < value; n++ ) {
                        this._bands[n] = n;
                    }
                }
                else {
                    this._bands = [0, 1, 2]; // default
                }
                return this;
            }
            // getter
            return this._bands;
        },
        "onAdd": function onAdd(map) {
            this._map = map;
            if( !this._canvas ) {
                this._canvas = L.DomUtil.create("canvas");
            }
            map._panes.overlayPane.appendChild(this._canvas);
            map.on("moveend", this._draw, this);
            this._draw();
        },
        "onRemove": function onRemove(map) {
            map.getPanes().overlayPane.removeChild(this._canvas);
            map.off('moveend', this._draw, this);
            if (map.options.zoomAnimation) {
                map.off('zoomanim', this._animateZoom, this);
            }
        },
        "_fit_canvas": function _fit_canvas() {
            if( !this._map ) {
                return null;
            }
            var topLeft = this._map.latLngToLayerPoint(this._map.getBounds().getNorthWest());
            var size = this._map.latLngToLayerPoint(
                this._map.getBounds().getSouthEast()
            )._subtract(topLeft);
            L.DomUtil.setPosition(this._canvas, topLeft);
            this._canvas.width = size.x;
            this._canvas.height = size.y;
            return this;
        },
        /**
         * Creates CogRequest class.
         * @param bbox BBox (in CRS unit) of view area.
         * This function uses also this._canvas, this._tiff_bbox, this._tiff_res, this._bands,
         *   this.options.fillValue, this.options.nodata .
         */
        "_calcCogReq": function _calcCogReq(bbox) {
            if( !bbox || !this._canvas || !this._tiff_bbox || !this._tiff_res ) {
                return null;
            }
            //
            var d = 2;
            var csize = [this._canvas.clientWidth, this._canvas.clientHeight];
            var res = [
                (bbox[2]-bbox[0])/this._canvas.clientWidth,
                (bbox[3]-bbox[1])/this._canvas.clientHeight
            ];
            // calculates wbox (Instersection of tiff box and view area)
            // wbbox - wbox in CRS unit.
            // wpbox - wbox in pixel.
            var wbbox = bbox.concat(); // shallow copy
            var wpbox = [];
            for( var n = 0; n < d; n++ ) {
                var m;
                // min
                m = n;
                if( bbox[m] < this._tiff_bbox[m] ) {
                    wbbox[m] = this._tiff_bbox[m];
                }
                wpbox[m] = parseInt((wbbox[m] - bbox[n])/res[n]);
                // max
                m = n + d;
                if( wbbox[m] > this._tiff_bbox[m] ) {
                    wbbox[m] = this._tiff_bbox[m];
                }
                wpbox[m] = parseInt((wbbox[m] - bbox[n])/res[n]);
                // swaps if needed
                if( this._tiff_res[n] < 0 ) {
                    m = n + d;
                    var wpbox_min = csize[n] - wpbox[n] - 1;
                    var wpbox_max = csize[n] - wpbox[m] - 1;
                    wpbox[n] = wpbox_max;
                    wpbox[m] = wpbox_min;
                }
            }
            // Extracts required parameters.
            var offset_x = wpbox[0];
            var offset_y = wpbox[1];
            var width = wpbox[2]-wpbox[0];
            var height = wpbox[3]-wpbox[1];
            if( width < 0 || height < 0 ) {
                return null;
            }
            // creates the new request (not run).
            return new CogRequest(
                this._tiff,
                [offset_x, offset_y],
                [width, height],
                wbbox,
                this._bands,
                this._canvas,
                this.options.fillValue,
                this.options.nodata
            );
        },
        "_draw": function _draw() {
            // checks whether this is locked.
            if( this._locked || !this._tiff ) {
                this._need_draw = true;
                return this;
            }
            this._need_draw = false;
            // checks whether this has a map and a canvas.
            if( !this._map || !this._canvas ) {
                return this;
            }
            // cancel older request.
            if( this._request != null ) {
                this._request.cancel();
                this._request = null;
            }
            // fits the canvas to map div.
            this._fit_canvas();
            // sets opacity
            L.DomUtil.setOpacity(this._canvas, this.options.opacity);
            var bbox_ll = this._map.getBounds();
            // gets bounds
            var zoom = this._map.getZoom();
            var corners = [
                L.Projection.SphericalMercator.project(bbox_ll.getSouthWest()),
                L.Projection.SphericalMercator.project(bbox_ll.getSouthEast()),
                L.Projection.SphericalMercator.project(bbox_ll.getNorthEast()),
                L.Projection.SphericalMercator.project(bbox_ll.getNorthWest())
            ];
            var bbox = [corners[0].x,corners[0].y,corners[0].x,corners[0].y];
            for( var n = 1; n < 4; n++ ) {
                if( corners[n].x < bbox[0] ) {
                    bbox[0] = corners[n].x;
                }
                if( corners[n].y < bbox[1] ) {
                    bbox[1] = corners[n].y;
                }
                if( corners[n].x > bbox[2] ) {
                    bbox[2] = corners[n].x;
                }
                if( corners[n].y > bbox[3] ) {
                    bbox[3] = corners[n].y;
                }
            }
            // calculates offset
            var viewWidth = this._canvas.clientWidth;
            // draws
            this._request = this._calcCogReq(bbox);
            if( this._request ) {
                this._request.run();
            }
            return this;
        }
    });
    //
    if( !BO.L.layer ) {
        BO.L.layer = {};
    }
    BO.L.layer.cog = function cog(url, bands, options) {
        return new BO.L.Layer.COG(url, bands, options);
    };

} )( typeof window !== "undefined" ? window : this );
