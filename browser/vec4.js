'use strict';

var $M = milsushi2;
$M.initcl();

function add_mat() {
  var a = $M.gpuArray($M.jsa2mat([[1, 2], [3, 4]]));
  var b = $M.gpuArray($M.jsa2mat([[9, 3], [5, 2]]));
  var c = $M.plus(a, b);
  console.log(a.toString());
  console.log('+');
  console.log(b.toString());
  console.log('=');
  console.log(c.toString());

}

function vec_add() {
  var kernel = $M.CL.createKernel([
      '__kernel void kernel_func(__global float *dst, float4 veca, float4 vecb) {',
      'dst[0] = veca.x + vecb.x;',
      'dst[1] = veca.y + vecb.y * 2;',
      'dst[2] = veca.z + vecb.z * 3;',
      'dst[3] = veca.w + vecb.w * 4;',
      '}'
  ].join('\n'));
  var dst = $M.zeros(1, 4, 'gpuArray');
  
    $M.CL.executeKernel(kernel,
    [{ access: $M.CL.WebCL.MEM_WRITE_ONLY, datum: dst },
    { type: $M.CL.WebCL.type.VEC4, datum: [1,2,3,4] },
    { type: $M.CL.WebCL.type.VEC4, datum: [0.1, 0.2, 0.3, 0.4] }],1);
    console.log(dst.toString());
}

add_mat();
vec_add();
