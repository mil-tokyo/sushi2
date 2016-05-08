'use strict';

(function () {
  var $CL;
  if (typeof window === 'undefined') {
    $CL = require('./driver_opencl.js');
  } else {
    $CL = require('./driver_webcl.js');
  }
  
  module.exports = $CL;
})();
