'use strict';

var $M = require('../sushi');

(function () {
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../matrix');
  var MatrixCL = require('./matrix_cl');
  var WebCL = $M.CL.WebCL;
  var ctypes = { single: 'float', int32: 'int', uint8: 'uchar', logical: 'uchar' };
  module.exports.ctypes = ctypes;
  var webcltypes = { single: WebCL.type.FLOAT, int32: WebCL.type.INT, uint8: WebCL.type.UCHAR, logical: WebCL.type.UCHAR };
  module.exports.webcltypes = webcltypes;
  
  // unify matrices into cpu / gpu, number is not changed
  var unify_mats = function (inputs) {
    // determine if MatrixCL exists
    var matcl_exist = false;
    for (var i = 0; i < inputs.length; i++) {
      var mati = inputs[i];
      if (mati instanceof MatrixCL) {
        matcl_exist = true;
        break;
      }
    }

    var unified_mats = { cl: matcl_exist, length: inputs.length };
    if (matcl_exist) {
      // cast all Matrix into MatrixCL
      for (var i = 0; i < inputs.length; i++) {
        var mati = inputs[i];
        if ((mati instanceof Matrix) && !(mati instanceof MatrixCL)) {
          unified_mats[i] = MatrixCL._fromnativemat(mati);
        } else {
          unified_mats[i] = mati;
        }
      }
    } else {
      for (var i = 0; i < inputs.length; i++) {
        var mati = inputs[i];
        unified_mats[i] = mati;
      }
    }

    return unified_mats;
  }
  
  module.exports.unify_mats = unify_mats;

  var unify_call = function (native_func, cl_func) {
    //call function using specified arguments unified
    var unified_mats = unify_mats(Array.prototype.slice.call(arguments, 2));
    if (unified_mats.cl) {
      return cl_func.apply(null, unified_mats);
    } else {
      return native_func.apply(null, unified_mats);
    }
  }

  module.exports.unify_call = unify_call;
})();
