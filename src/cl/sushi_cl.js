'use strict';
// overwrites functions in $M by opencl-aware version

var $M = require('../sushi');
module.exports = $M;

(function () {
  if ($M.CL) {
    return;
  }
  $M.CL = require('./driver');
  
  var Matrix = require('../matrix');
  var MatrixCL = require('./matrix_cl');
  var WebCL = $M.CL.WebCL;
  
  $M.gpuArray = function (A) {
    var mat = new MatrixCL(A._size, A._klass);
    mat.write(A._data);
    return mat;
  };
  
  $M.gather = function (A) {
    var mat = new Matrix(A._size, A._klass);
    A.read(mat._data);
    return mat;
  };
})();
