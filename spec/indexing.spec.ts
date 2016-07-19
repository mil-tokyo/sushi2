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

var names = ["get_colon", "set_colon", "set_scalar_colon", "get_colon_ex"];

function load_npy(basedir, basename): $M.Matrix {
  var path = basedir + '/' + basename + '.npy';
  var m = $M.npyread(fs.readFileSync(path));
  if (cl_enabled) {
    m = $M.gpuArray(m);
  }
  return m;
}

function make_test(test_name: string) {
  var f = () => {
    $M.autodestruct(() => {
      var case_dir = 'spec/fixture/indexing/' + test_name;
      var case_script = fs.readFileSync(case_dir + '/expect.js', 'utf8');
      var x = load_npy(case_dir, 'x');
      var y = load_npy(case_dir, 'y');
      var z = load_npy(case_dir, 'z');
      var indexing_error = load_npy(case_dir, 'indexing_error');

      eval(case_script);
    });
  }
  return f;
}

describe('indexing', () => {
  for (var i = 0; i < names.length; i++) {
    var test_name = names[i];
    it(test_name, make_test(test_name));
  }
});
