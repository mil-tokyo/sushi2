import $M = require('../src/sushi');

declare var require;
declare var process;
declare var Buffer;
var os = require('os');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var cl_enabled = Boolean(Number(process.env['TEST_CL']));
console.log('OpenCL ' + cl_enabled);
var MatrixCL = null;
if (cl_enabled) {
  $M.initcl();
  MatrixCL = require('../src/cl/matrix_cl');
}

describe('cl', () => {
  it('vec4', () => {
    var WebCL = $M.CL.WebCL;
    var kernel = $M.CL.createKernel([
      '__kernel void kernel_func(__global float *dst, int4 vec) {',
      'dst[0] = vec.x + vec.y + vec.z + vec.w + 5;',
      '}'
    ].join('\n'));
    var m = $M.ones(1, 1, 'gpuArray');
    m.disp();
    $M.CL.executeKernel(kernel,
    [{ access: WebCL.MEM_WRITE_ONLY, datum: m },
    { type: WebCL.type.VEC4, datum: [1,2,3,4] }],1);
    m.disp();
  });
});
