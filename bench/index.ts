import $M = require('../src/sushi');

declare var require;
declare var process;
declare var Buffer;
var os = require('os');
var fs = require('fs');
var child_process = require('child_process');
var cl_enabled = Boolean(Number(process.env['TEST_CL']));
console.log('OpenCL ' + cl_enabled);
var MatrixCL = null;
if (cl_enabled) {
  $M.initcl();
  MatrixCL = require('../src/cl/matrix_cl');
}

import BenchBase = require('./bench_base');
import mtimes = require('./mtimes');

function time(f: BenchBase): number {
  var elapsed = 0;
  $M.autodestruct(() => {
    var args = f.setup();
    if (!args) {
      args = [];
    }
    if (cl_enabled) {
      $M.CL.finish();
    }
    var begin = Date.now();
    f.run(...args);
    if (cl_enabled) {
      $M.CL.finish();
    }
    var end = Date.now();
    elapsed = end - begin;
    console.log('' + f.name + ': ' + elapsed + 'ms');
    return;
  });
  return elapsed;
}

function main() {
  time(new mtimes(2000, 2000, 2000));
}

main();
