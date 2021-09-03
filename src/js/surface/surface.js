
/*jslint browser: true, node: true */
/*global  */

"use strict";

/*** Imports ***/
var papaya = papaya || {};
papaya.surface = papaya.surface || {};


/*** Constructor ***/
papaya.surface.Surface = papaya.surface.Surface || function (progressMeter, params) {
    this.progressMeter = progressMeter;
    this.error = null;
    this.filename = null;
    this.rawData = null;
    this.onFinishedRead = null;
    this.pointData = null;
    this.triangleData = null;
    this.normalsData = null;
    this.colorsData = null;
    this.numPoints = 0;
    this.numTriangles = 0;
    this.pointsBuffer = null;
    this.trianglesBuffer = null;
    this.normalsBuffer = null;
    this.colorsBuffer = null;
    this.solidColor = null;
    this.surfaceType = papaya.surface.Surface.SURFACE_TYPE_UNKNOWN;
    this.fileFormat = null;
    this.params = params;
    this.nextSurface = null;
    this.volume = null;
    this.alpha = 1;
    this.parametricData = [];
    this.boundaryData = null;
};

/*** Static Pseudo-constants ***/

papaya.surface.Surface.SURFACE_TYPE_UNKNOWN = 0;
papaya.surface.Surface.SURFACE_TYPE_GIFTI = 1;
papaya.surface.Surface.SURFACE_TYPE_MANGO = 2;
papaya.surface.Surface.SURFACE_TYPE_VTK = 3;



/*** Static Methods ***/

papaya.surface.Surface.findSurfaceType = function (filename) {
    if (gifti.isThisFormat(filename)) {
        return papaya.surface.Surface.SURFACE_TYPE_GIFTI;
    } else if (papaya.surface.SurfaceMango.isThisFormat(filename)) {
        return papaya.surface.Surface.SURFACE_TYPE_MANGO;
    } else if (papaya.surface.SurfaceVTK.isThisFormat(filename)) {
        return papaya.surface.Surface.SURFACE_TYPE_VTK;
    }

    return papaya.surface.Surface.SURFACE_TYPE_UNKNOWN;
};




/*** Prototype Methods ***/

papaya.surface.Surface.prototype.makeFileFormat = function (filename) {
    this.surfaceType = papaya.surface.Surface.findSurfaceType(filename);

    if (this.surfaceType === papaya.surface.Surface.SURFACE_TYPE_GIFTI) {
        this.fileFormat = new papaya.surface.SurfaceGIFTI();
    } else if (this.surfaceType === papaya.surface.Surface.SURFACE_TYPE_MANGO) {
        this.fileFormat = new papaya.surface.SurfaceMango();
    } else if (this.surfaceType === papaya.surface.Surface.SURFACE_TYPE_VTK) {
        this.fileFormat = new papaya.surface.SurfaceVTK();
    }
};



papaya.surface.Surface.prototype.readURL = function (url, volume, callback) {
    var xhr, surface = this;

    this.filename = url.substr(url.lastIndexOf("/") + 1, url.length);
    this.onFinishedRead = callback;
    this.volume = volume;
    this.processParams(this.filename);
    this.makeFileFormat(this.filename);

    if (this.surfaceType === papaya.surface.Surface.SURFACE_TYPE_UNKNOWN) {
        this.error = new Error("This surface format is not supported!");
        this.finishedLoading();
        return;
    }

    try {
        if (typeof new XMLHttpRequest().responseType === 'string') {
            xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            if (this.fileFormat.isSurfaceDataBinary()) {
                xhr.responseType = 'arraybuffer';
            }

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        surface.rawData = xhr.response;
                        surface.finishedLoading();
                    } else {
                        surface.error = new Error("There was a problem reading that file (" + surface.filename + "):\n\nResponse status = " + xhr.status);
                        surface.finishedLoading();
                    }
                }
            };

            xhr.onprogress = function (evt) {
                if (evt.lengthComputable) {
                    surface.progressMeter.drawProgress(evt.loaded / evt.total, papaya.volume.Volume.PROGRESS_LABEL_LOADING);
                }
            };

            xhr.send(null);
        } else {
            surface.error = new Error("There was a problem reading that file (" + surface.filename + "):\n\nResponse type is not supported.");
            surface.finishedLoading();
        }
    } catch (err) {
        if (surface !== null) {
            surface.error = new Error("There was a problem reading that file (" + surface.filename + "):\n\n" + err.message);
            surface.finishedLoading();
        }
    }
};



papaya.surface.Surface.prototype.readFile = function (file, volume, callback) {
    var blob = papaya.utilities.PlatformUtils.makeSlice(file, 0, file.size),
        surface = this;

    this.filename = file.name;
    this.onFinishedRead = callback;
    this.volume = volume;
    this.processParams(this.filename);
    this.makeFileFormat(this.filename);

    if (this.surfaceType === papaya.surface.Surface.SURFACE_TYPE_UNKNOWN) {
        this.error = new Error("This surface format is not supported!");
        this.finishedLoading();
        return;
    }

    try {
        var reader = new FileReader();

        reader.onloadend = function (evt) {
            if (evt.target.readyState === FileReader.DONE) {
                surface.rawData = evt.target.result;
                surface.finishedLoading();
            }
        };

        reader.onerror = function (evt) {
            surface.error = new Error("There was a problem reading that file:\n\n" + evt.getMessage());
            surface.finishedLoading();
        };

        if (this.fileFormat.isSurfaceDataBinary()) {
            reader.readAsArrayBuffer(blob);
        } else {
            reader.readAsText(blob);
        }
    } catch (err) {
        surface.error = new Error("There was a problem reading that file:\n\n" + err.message);
        surface.finishedLoading();
    }
};



papaya.surface.Surface.prototype.readEncodedData = function (name, volume, callback) {
    this.filename = (name + ".surf.gii");
    this.onFinishedRead = callback;
    this.volume = volume;
    this.processParams(name);
    this.makeFileFormat(this.filename);

    if (this.surfaceType === papaya.surface.Surface.SURFACE_TYPE_UNKNOWN) {
        this.error = new Error("This surface format is not supported!");
        this.finishedLoading();
        return;
    }

    try {
        if (this.fileFormat.isSurfaceDataBinary()) {
            this.rawData = Base64Binary.decodeArrayBuffer(papaya.utilities.ObjectUtils.dereference(name));
        } else {
            this.rawData = atob(papaya.utilities.ObjectUtils.dereference(name));
        }
    } catch (err) {
        this.error = new Error("There was a problem reading that file:\n\n" + err.message);
    }

    this.finishedLoading();
};



papaya.surface.Surface.prototype.processParams = function (name) {
    var screenParams = this.params[name];
    if (screenParams) {
        if (screenParams.color !== undefined) {
            this.solidColor = screenParams.color;
        }

        if (screenParams.alpha !== undefined) {
            this.alpha = screenParams.alpha;
        }

        if (screenParams.icon !== undefined) {
            this.staticIcon = screenParams.icon;
        }
    }
};



papaya.surface.Surface.prototype.finishedLoading = function () {
    this.readData();
};



papaya.surface.Surface.prototype.readData = function () {
    if (this.error) {
        console.log(this.error);
        this.onFinishedRead(this);
        return;
    }

    var progMeter = this.progressMeter;
    var prog = function(val) {
        progMeter.drawProgress(val, "Loading surface...");
    };

    try {
        this.fileFormat.readData(this.rawData, prog, papaya.utilities.ObjectUtils.bind(this, this.finishedReading), this.volume);
    } catch (err) {
        this.error = err;
        this.onFinishedRead(this);
    }
};



papaya.surface.Surface.prototype.finishedReading = function () {
    var numSurfaces = this.fileFormat.getNumSurfaces(), currentSurface = this, ctr;

    if (this.fileFormat.error) {
        this.error = this.fileFormat.error;
    } else {
        for (ctr = 0; ctr < numSurfaces; ctr += 1) {
            if (ctr > 0) {
                currentSurface.nextSurface = new papaya.surface.Surface();
                currentSurface = currentSurface.nextSurface;
            }

            if (this.fileFormat.getSolidColor(ctr)) {
                currentSurface.solidColor = this.fileFormat.getSolidColor(ctr);
            }

            currentSurface.generateColorData();

            currentSurface.numPoints = this.fileFormat.getNumPoints(ctr);
            currentSurface.numTriangles = this.fileFormat.getNumTriangles(ctr);
            currentSurface.pointData = this.fileFormat.getPointData(ctr);
            currentSurface.normalsData = this.fileFormat.getNormalsData(ctr);
            currentSurface.triangleData = this.fileFormat.getTriangleData(ctr);
            currentSurface.colorsData = this.fileFormat.getColorsData(ctr);

            if (currentSurface.normalsData === null) {
                this.generateNormals();
            }
        }
    }

    this.progressMeter.drawProgress(1, "Loading surface...");
    this.onFinishedRead(this);
};



papaya.surface.Surface.prototype.generateNormals = function () {
    var p1 = [], p2 = [], p3 = [], normal = [], nn = [], ctr,
        normalsDataLength = this.pointData.length, numIndices,
        qx, qy, qz, px, py, pz, index1, index2, index3;

    this.normalsData = new Float32Array(normalsDataLength);

    numIndices = this.numTriangles * 3;
    for (ctr = 0; ctr < numIndices; ctr += 3) {
        index1 = this.triangleData[ctr] * 3;
        index2 = this.triangleData[ctr + 1] * 3;
        index3 = this.triangleData[ctr + 2] * 3;

        p1.x = this.pointData[index1];
        p1.y = this.pointData[index1 + 1];
        p1.z = this.pointData[index1 + 2];

        p2.x = this.pointData[index2];
        p2.y = this.pointData[index2 + 1];
        p2.z = this.pointData[index2 + 2];

        p3.x = this.pointData[index3];
        p3.y = this.pointData[index3 + 1];
        p3.z = this.pointData[index3 + 2];

        qx = p2.x - p1.x;
        qy = p2.y - p1.y;
        qz = p2.z - p1.z;
        px = p3.x - p1.x;
        py = p3.y - p1.y;
        pz = p3.z - p1.z;

        normal[0] = (py * qz) - (pz * qy);
        normal[1] = (pz * qx) - (px * qz);
        normal[2] = (px * qy) - (py * qx);

        this.normalsData[index1] += normal[0];
        this.normalsData[index1 + 1] += normal[1];
        this.normalsData[index1 + 2] += normal[2];

        this.normalsData[index2] += normal[0];
        this.normalsData[index2 + 1] += normal[1];
        this.normalsData[index2 + 2] += normal[2];

        this.normalsData[index3] += normal[0];
        this.normalsData[index3 + 1] += normal[1];
        this.normalsData[index3 + 2] += normal[2];
    }

    for (ctr = 0; ctr < normalsDataLength; ctr += 3) {
        normal[0] = -1 * this.normalsData[ctr];
        normal[1] = -1 * this.normalsData[ctr + 1];
        normal[2] = -1 * this.normalsData[ctr + 2];

        vec3.normalize(normal, nn);

        this.normalsData[ctr] = nn[0];
        this.normalsData[ctr + 1] = nn[1];
        this.normalsData[ctr + 2] = nn[2];
    }
};


papaya.surface.Surface.prototype.generateColorData = function () {
  var rgba = this.fileFormat.colorsData;
  var nPoints = this.fileFormat.getNumPoints();

  if (rgba == null) {
    var nArray = 4 * nPoints;
    this.fileFormat.colorsData = rgba = new Float32Array(nArray);
  }

  var ctr;
  var ctr2;
  var data = [];
  for (ctr=this.parametricData.length - 1; ctr >= 0; ctr--) {
    if (this.parametricData[ctr].data && this.parametricData[ctr].data.length === nPoints) {
      this.parametricData[ctr].positiveVolume = null;
      this.parametricData[ctr].negativeVolume = null;
      for(ctr2 = 0; ctr2 < this.parametricData[ctr].viewer.screenVolumes.length; ctr2++) {
        let vol = this.parametricData[ctr].viewer.screenVolumes[ctr2];
        if ((vol.volume === this.parametricData[ctr].volume) && !vol.hidden) {
          if (vol.negative) {
            this.parametricData[ctr].negativeVolume = vol;
          } else {
            this.parametricData[ctr].positiveVolume = vol;
          }
        }
      }
      this.parametricData[ctr].mapper = getColor;
      data.push(this.parametricData[ctr]);
    }
  }
  if (this.boundaryData != null &&
    this.boundaryData.data != null &&
    this.boundaryData.data.length){
    this.boundaryData.mapper = binaryMapper;
    data.push(this.boundaryData);
  }

  if (data.length < 1) {
    rgba.fill(1,0,4*nPoints);
    return;
  }

  var baseColor = this.solidColor ? {r: this.solidColor[0], g: this.solidColor[1], b: this.solidColor[2], a: 1}
                                  : {r:1,g:1,b:1,a:1};

  var color, color1;
  var index = 0;
  for (ctr = 0; ctr < nPoints; ctr++) {
    color = {r: 0, g: 0, b: 0, a: 0};
    for (ctr2=0; ctr2 < data.length; ctr2++) {
      color1 = data[ctr2].mapper(data[ctr2].data[ctr], data[ctr2]);
      color = combine(color, color1);
    }
    if (color.a < 1) {
      color = combine(color, baseColor);
    }
    rgba[index++] = color.r;
    rgba[index++] = color.g;
    rgba[index++] = color.b;
    rgba[index++] = color.a;
  }
}


function binaryMapper(value, boundaryData) {
  if (value > 0.5) {
    return {
      r: 0,
      g: 0,
      b: 0,
      a: boundaryData.range.alpha,
    };
  }
  else {
    return {
      r: 1,
      g: 1,
      b: 1,
      a: 1
    };
  }
}

function getColor(value, parametricData) {
    var color = {r: 0, g: 0, b: 0, a: 0};

    if (parametricData.negativeVolume && value < parametricData.negativeVolume.screenMin ) {
      if (value >= parametricData.negativeVolume.screenMin) {
        value = papaya.viewer.ScreenSlice.SCREEN_PIXEL_MIN;
      } else if (value <= parametricData.negativeVolume.screenMax) {
        value = papaya.viewer.ScreenSlice.SCREEN_PIXEL_MAX;
      } else {
        value = papayaRoundFast((value - parametricData.negativeVolume.screenMin) *
          parametricData.negativeVolume.screenRatio);
      }
      color.r = parametricData.negativeVolume.colorTable.lookupRed(value)/papaya.viewer.ColorTable.LUT_MAX;
      color.g = parametricData.negativeVolume.colorTable.lookupGreen(value)/papaya.viewer.ColorTable.LUT_MAX;
      color.b = parametricData.negativeVolume.colorTable.lookupBlue(value)/papaya.viewer.ColorTable.LUT_MAX;
      color.a = parametricData.negativeVolume.alpha;
    } else if (parametricData.positiveVolume && value >= parametricData.positiveVolume.screenMin) {
      if (value <= parametricData.positiveVolume.screenMin) {
        value = papaya.viewer.ScreenSlice.SCREEN_PIXEL_MIN;
      } else if (value >= parametricData.positiveVolume.screenMax) {
        value = papaya.viewer.ScreenSlice.SCREEN_PIXEL_MAX;
      } else {
        value = papayaRoundFast((value - parametricData.positiveVolume.screenMin) *
          parametricData.positiveVolume.screenRatio);
      }
      color.r = parametricData.positiveVolume.colorTable.lookupRed(value)/papaya.viewer.ColorTable.LUT_MAX ;
      color.g = parametricData.positiveVolume.colorTable.lookupGreen(value)/papaya.viewer.ColorTable.LUT_MAX;
      color.b = parametricData.positiveVolume.colorTable.lookupBlue(value)/papaya.viewer.ColorTable.LUT_MAX;
      color.a = parametricData.positiveVolume.alpha;
    }
    return color;
}

function combine(color0, color1) {
  var a01 = (1 - color0.a) * color1.a + color0.a;
  if (a01 <= Number.EPSILON) {
    return color0;
  }
  return {
    a: a01,
    r: ((1 - color0.a) * color1.a * color1.r + color0.a * color0.r) / a01,
    g: ((1 - color0.a) * color1.a * color1.g + color0.a * color0.g) / a01,
    b: ((1 - color0.a) * color1.a * color1.b + color0.a * color0.b) / a01
  };
}
