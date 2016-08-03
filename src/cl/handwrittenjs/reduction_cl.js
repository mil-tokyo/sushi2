'use strict';
// overwrites reduction functions

var $M = require('../../sushi');
var util = require('../../util');
var util_cl = require('./util_cl');

(function () {
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../../matrix');
  var MatrixCL = require('../matrix_cl');
  var WebCL = $M.CL.WebCL;
  var ctypes = util_cl.ctypes;
  var webcltypes = util_cl.webcltypes;

  var maxmin_reduction_along_axis_cl = function (A, dim, name, is_min, is_argmax) {
    if (dim == null) {
      //select first non-1 axis
      dim = A._numel;
      for (var i = 0; i < A._size.length; i++) {
        var dimsize = A._size[i];
        if (dimsize !== 1) {
          dim = i + 1;
          break;
        }
      }
    }

    if (dim > A._ndims) {
      //max along axis with size 1
      if (is_argmax) {
        var amat = new MatrixCL(A._size, 'int32');
        amat._fill(1);
        return { M: A.copy(), I: amat };
      } else {
        return A.copy();
      }
    }

    var dstsize = A._size.slice();
    if (dstsize[dim - 1] !== 0) {
      //size 0 dimension is preserved
      dstsize[dim - 1] = 1;
    }

    if ((A._numel === 0) || (A._size[dim - 1] === 1)) {
      //only change shape
      var dst_onlyreshape = A.copy();
      dst_onlyreshape.reshape_inplace(dstsize);
      if (is_argmax) {
        var amat = new MatrixCL(dstsize, 'int32');
        amat._fill(1);
        return { M: dst_onlyreshape, I: amat };
      } else {
        return dst_onlyreshape;
      }
    }

    //reduction actually needed
    var dst = new MatrixCL(dstsize, A._klass);
    var argmax = null;
    if (is_argmax) {
      argmax = new MatrixCL(dstsize, 'int32');
    }
    var input_strides = A._strides;
    var output_strides = dst._strides.slice();
    while (output_strides.length <= input_strides.length) {
      output_strides.push(dst._numel);
    }
    var output_strides_mat = MatrixCL._fromtypedarray(new Int32Array(output_strides), 'int32');
    var input_strides_mat = MatrixCL._fromtypedarray(new Int32Array(A._strides), 'int32');

    var reduction_step = input_strides[dim - 1];
    var reduction_count = A._size[dim - 1];
    var dims = A._ndims;

    var kernel_name = 'maxmin_reduction_cl_' + name + '_' + (A._klass) + '_' + dims;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_DST_TYPE ' + ctypes[A._klass],
        '#define DIMS ' + dims,
        '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src,',
        is_argmax ? '__global int *argmax,' : '',
        ' uint length,',
        '__global int *output_strides, __global int *input_strides, int reduction_step, int reduction_count) {',
        '  int i = (int)get_global_id(0);',
        '  if (i >= length) { return; }',
        '  int src_idx = 0;',
        '  for (int d = 0; d < DIMS; d++) {',
        '    src_idx += i % output_strides[d+1] / output_strides[d] * input_strides[d];',
        '  }',
        '  SRC_DST_TYPE val = src[src_idx];',
        '  SRC_DST_TYPE accum = val;',
        is_argmax ? '  int accumarg = 0;' : '',
        '  for (int red = 1; red < reduction_count; red++) {',
        '    src_idx += reduction_step;',
        '    val = src[src_idx];',
        is_min ? (is_argmax ? 'if (val < accum) { accum = val; accumarg = red; }' : 'if (val < accum) { accum = val; }')
          : (is_argmax ? 'if (val > accum) { accum = val; accumarg = red; }' : 'if (val > accum) { accum = val; }'),//'    if (val > accum) { accum = val; }'
        '  }',
        '  dst[i] = accum;',
        is_argmax ? 'argmax[i] = accumarg + 1;' : '',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (dst._numel > 0) {
      if (is_argmax) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: dst },
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { access: WebCL.MEM_WRITE_ONLY, datum: argmax },
          { datum: dst._numel, type: WebCL.type.INT },
          { access: WebCL.MEM_READ_ONLY, datum: output_strides_mat },
          { access: WebCL.MEM_READ_ONLY, datum: input_strides_mat },
          { datum: reduction_step, type: WebCL.type.INT },
          { datum: reduction_count, type: WebCL.type.INT }
        ], dst._numel);

      } else {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: dst },
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { datum: dst._numel, type: WebCL.type.INT },
          { access: WebCL.MEM_READ_ONLY, datum: output_strides_mat },
          { access: WebCL.MEM_READ_ONLY, datum: input_strides_mat },
          { datum: reduction_step, type: WebCL.type.INT },
          { datum: reduction_count, type: WebCL.type.INT }
        ], dst._numel);
      }
    }

    if (is_argmax) {
      return { M: dst, I: argmax };
    } else {
      return dst;
    }
  };

  var stat_reduction_along_axis_cl = function (A, dim, name, init_accum, update_accum, assign_result) {
    // for statistics methods, output is single klass
    if (dim == null) {
      //select first non-1 axis
      dim = A._numel;
      for (var i = 0; i < A._size.length; i++) {
        var dimsize = A._size[i];
        if (dimsize !== 1) {
          dim = i + 1;
          break;
        }
      }
    }

    var virtual_input_shape = A._size.concat();
    while (dim > virtual_input_shape.length) {
      // A._size = [10, 20], dim = 4 => virtual_input_shape = [10, 20, 1, 1]
      virtual_input_shape.push(1);
    }
    var dstsize = virtual_input_shape.concat();
    if (dstsize[dim - 1] !== 0) {
      //size 0 dimension is preserved
      dstsize[dim - 1] = 1;
    }

    //reduction actually needed
    var dst = new MatrixCL(dstsize, 'single');
    if (A._numel == 0) {
      return dst;//empty
    }
    var dims = virtual_input_shape.length;
    var input_strides = [];
    var tmp = 1;
    for (var i = 0; i < dims; i++) {
      input_strides.push(tmp);
      tmp *= virtual_input_shape[i];
    }
    var output_strides = [];
    tmp = 1;
    for (var i = 0; i < dims; i++) {
      output_strides.push(tmp);
      tmp *= dstsize[i];
    }
    output_strides.push(tmp);//excess 1 dimension required

    var output_strides_mat = MatrixCL._fromtypedarray(new Int32Array(output_strides), 'int32');
    var input_strides_mat = MatrixCL._fromtypedarray(new Int32Array(input_strides), 'int32');

    var reduction_step = input_strides[dim - 1];
    var reduction_count = virtual_input_shape[dim - 1];

    var kernel_name = 'stat_reduction_cl_' + name + '_' + (A._klass) + '_' + dims;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_TYPE ' + ctypes[A._klass],
        '#define DST_TYPE float',
        '#define DIMS ' + dims,
        '__kernel void kernel_func(__global DST_TYPE *dst, __global const SRC_TYPE *src,',
        ' uint length,',
        '__global const int *output_strides, __global const int *input_strides, int reduction_step, int reduction_count) {',
        '  int i = (int)get_global_id(0);',
        '  if (i >= length) { return; }',
        '  int src_idx = 0;',
        '  for (int d = 0; d < DIMS; d++) {',
        '    src_idx += i % output_strides[d+1] / output_strides[d] * input_strides[d];',
        '  }',
        '  DST_TYPE val = src[src_idx];',
        init_accum,//'  DST_TYPE accum = val;',
        '  for (int red = 1; red < reduction_count; red++) {',
        '    src_idx += reduction_step;',
        '    val = (DST_TYPE)src[src_idx];',
        update_accum,
        '  }',
        assign_result,//'  dst[i] = accum;',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    $CL.executeKernel(kernel, [
      { access: WebCL.MEM_WRITE_ONLY, datum: dst },
      { access: WebCL.MEM_READ_ONLY, datum: A },
      { datum: dst._numel, type: WebCL.type.INT },
      { access: WebCL.MEM_READ_ONLY, datum: output_strides_mat },
      { access: WebCL.MEM_READ_ONLY, datum: input_strides_mat },
      { datum: reduction_step, type: WebCL.type.INT },
      { datum: reduction_count, type: WebCL.type.INT }
    ], dst._numel);

    return dst;
  };

  var max_native = $M.max;
  $M.max = function (A, B, dim) {
    return $M.autodestruct(function () {
      var mats = util_cl.unify_mats([A, B]);
      if (mats.cl) {
        if (B == null) {
          return maxmin_reduction_along_axis_cl(A, dim, 'max', false, false);
        } else {
          return $M.CL._max_elementwise_cl(mats[0], mats[1]);
        }
      } else {
        return max_native(mats[0], mats[1], dim);
      }
    });
  };

  var min_native = $M.min;
  $M.min = function (A, B, dim) {
    return $M.autodestruct(function () {
      var mats = util_cl.unify_mats([A, B]);
      if (mats.cl) {
        if (B == null) {
          return maxmin_reduction_along_axis_cl(A, dim, 'min', true, false);
        } else {
          return $M.CL._min_elementwise_cl(mats[0], mats[1]);
        }
      } else {
        return min_native(mats[0], mats[1], dim);
      }
    });
  };

  var argmax_native = $M.argmax;
  $M.argmax = function (A, dummy, dim) {
    if (A instanceof MatrixCL) {
      return maxmin_reduction_along_axis_cl(A, dim, 'argmax', false, true);
    } else {
      return argmax_native(A, dummy, dim);
    }
  };
  var argmin_native = $M.argmin;
  $M.argmin = function (A, dummy, dim) {
    if (A instanceof MatrixCL) {
      return maxmin_reduction_along_axis_cl(A, dim, 'argmin', true, true);
    } else {
      return argmin_native(A, dummy, dim);
    }
  };

  var replace_sum = function (f_native, name, init_accum, update_accum, assign_result) {
    return function (A) {//(A: Matrix, dim: number, outtype?: string)
      if (A instanceof MatrixCL) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
          args[_i] = arguments[_i];
        }
        var dim = undefined;
        var outtype = undefined;
        for (var i = 1; i < arguments.length; i++) {
          var arg = arguments[i];
          if (typeof (arg) === 'string') {
            if (arg != 'native') {
              throw new Error('Outtype other than native is currently not supported');
            }
          } else if (typeof (arg) === 'number') {
            dim = arg;
          } else {
            throw new Error('Unknown argument ' + arg);
          }
        }
        return stat_reduction_along_axis_cl(A, dim, name,
          init_accum, update_accum, assign_result);
      } else {
        //use native
        return f_native.apply(null, arguments);
      }
    };
  }

  $M.sum = replace_sum($M.sum, 'sum', 'DST_TYPE accum = val;', 'accum += val;', 'dst[i] = accum;');
  $M.mean = replace_sum($M.mean, 'mean', 'DST_TYPE accum = val;', 'accum += val;', 'dst[i] = accum / reduction_count;');

  var replace_variance = function (f_native, name, do_sqrt) {
    return function (A, w, dim) {//(A: Matrix, w: number = 0, dim?: number)
      if (A instanceof MatrixCL) {
        var assign_result;
        if (w == null || w == 0) {
          assign_result = 'dst[i] = ' + do_sqrt + '((sqsum - normalsum * normalsum / reduction_count) / (reduction_count > 1 ? reduction_count - 1 : 1));';
        } else if (w == 1) {
          assign_result = 'dst[i] = ' + do_sqrt + '((sqsum - normalsum * normalsum / reduction_count) / reduction_count);';
        } else {
          throw new Error('w must be 0 or 1');
        }
        return stat_reduction_along_axis_cl(A, dim, name + w,
          'DST_TYPE normalsum = (DST_TYPE)val; DST_TYPE sqsum = (DST_TYPE)val * (DST_TYPE)val;', 'normalsum += val; sqsum += (DST_TYPE)val * (DST_TYPE)val;', assign_result);
      } else {
        //use native
        return f_native.apply(null, arguments);
      }
    };
  }

  $M.variance = replace_variance($M.variance, 'variance', '');
  $M.std = replace_variance($M.std, 'std', 'sqrt');
})();
