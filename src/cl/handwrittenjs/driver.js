'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.

(function () {
  var $CL;
  if (typeof window === 'undefined') {
    $CL = require('./driver_opencl.js');
  } else {
    $CL = require('./driver_webcl.js');
  }
  
  module.exports = $CL;
})();
