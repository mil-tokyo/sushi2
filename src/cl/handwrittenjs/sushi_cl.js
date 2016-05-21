'use strict';
// overwrites functions in $M by opencl-aware version

var $M = require('../../sushi');
var util = require('../../util');
module.exports = $M;

(function () {
  if ($M.CL) {
    return;
  }
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../../matrix');
  var MatrixCL = require('../matrix_cl');
  var WebCL = $M.CL.WebCL;

  $M.gpuArray = function (A) {
    if (A instanceof MatrixCL) {
      return A.copy();
    }
    A = util.as_mat(A);
    var mat = new MatrixCL(A._size, A._klass);
    mat.write(A._data);
    return mat;
  };

  $M.gather = function (A) {
    if (!(A instanceof MatrixCL)) {
      return A.copy();
    }
    var mat = new Matrix(A._size, A._klass);
    A.read(mat._data);
    return mat;
  };

  $M.devicetype = function (A) {
    if (A instanceof MatrixCL) {
      return 'cl';
    } else if (A instanceof Matrix) {
      return 'cpu';
    }
    return null;
  }

  var zeros_native = $M.zeros;
  $M.zeros = function () {
    //generate gpuArray if final argument is 'gpuArray'
    if (arguments[arguments.length - 1] == 'gpuArray') {
      var format = util.calc_zeros_size(Array.prototype.slice.call(arguments, 0, -1));
      var mat = new MatrixCL(format.size, format.klass);
      mat._fill(0);
      return mat;
    } else {
      return zeros_native.apply(null, arguments);
    }
  };
  var ones_native = $M.ones;
  $M.ones = function () {
    //generate gpuArray if final argument is 'gpuArray'
    if (arguments[arguments.length - 1] == 'gpuArray') {
      var format = util.calc_zeros_size(Array.prototype.slice.call(arguments, 0, -1));
      var mat = new MatrixCL(format.size, format.klass);
      mat._fill(1);
      return mat;
    } else {
      return ones_native.apply(null, arguments);
    }
  };

  require('./binary_arithmetic');
  require('./unary_arithmetic');
  require('./shape_converter_cl');
  require('./reduction_cl');
  require('./clblasgemm');
})();
