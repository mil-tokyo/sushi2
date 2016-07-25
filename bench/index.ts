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
import slice = require('./slice');

function time(f: BenchBase, n_run: number = 3): number {
  var elapsed = 0;
  $M.autodestruct(() => {
    var args = f.setup();
    if (!args) {
      args = [];
    }
    f.run(...args);//pre-run to compile kernel
    if (cl_enabled) {
      $M.CL.finish();
    }
    var runtimes = [];
    for (var i = 0; i < n_run; i++) {
      var begin = Date.now();
      f.run(...args);
      if (cl_enabled) {
        $M.CL.finish();
      }
      var end = Date.now();
      var current_elapsed = end - begin;
      runtimes.push(current_elapsed);
    }

    //get min-running time
    elapsed = Math.min.apply(null, runtimes);
    console.log('' + f.name + ': ' + elapsed + 'ms');
    return;
  });
  return elapsed;
}

function main() {
  time(new mtimes(2000, 2000, 2000));
  time(new slice('get', [10000, 100, 20], [$M.colon(), $M.colon(1, $M.end-1), $M.jsa2mat([1,3,5], false, 'int32')]));
}

main();
