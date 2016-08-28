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
import transpose = require('./transpose');
import permute = require('./permute');
import mtimes_trans = require('./mtimes_trans');
import destruct = require('./destruct');
import mtimes_largek = require('./mtimes_largek');

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
  time(new mtimes_trans(27, 64, 1605632, true, false));
  time(new mtimes_largek(27, 64, 1605632));
  time(new mtimes(55*55*1, 96, 11*11*3));
  time(new slice('get', [10000, 100, 20], [$M.colon(), $M.colon(1, $M.end-1), $M.jsa2mat([1,3,5], false, 'int32')]));
  time(new transpose(9216, 4096));
  time(new permute([55, 55, 96, 128], [1, 2, 4, 3]));
  time(new permute([55, 55, 96, 128], [4, 1, 2, 3]));
  time(new destruct(1024*1024*10));
  mtimes_trans_alexnet();
}

function mtimes_trans_alexnet() {
  var combination = function (name, m, n, k) {
    console.log(name);
    time(new mtimes_trans(m, n, k, false, false));//fwd
    time(new mtimes_trans(m, k, n, false, true));//back
    time(new mtimes_trans(k, n, m, true, false));//update
  }

  combination('conv1', 387200, 96, 363);
  combination('conv2', 93312, 256, 1200);//group
  combination('conv3', 93312, 384, 2304);
  combination('conv4', 21632, 384, 1728);//group
  combination('conv5', 21632, 256, 1728);//group
}

main();
