import Matrix = require('../matrix');
import Colon = require('../colon');
import typedef = require('../typedef');
import $CL = require('./handwrittenjs/driver');
var WebCL = $CL.WebCL;

var ctypes = { single: 'float', int32: 'int', uint8: 'uchar', logical: 'uchar' };
var webcltypes = { single: WebCL.type.FLOAT, int32: WebCL.type.INT, uint8: WebCL.type.UCHAR, logical: WebCL.type.UCHAR };

type AllowedTypedArray = typedef.AllowedTypedArray;

class MatrixCL extends Matrix {
  _clbuffer: $CL.clBuffer;
  static kernel_cache = {};
  constructor(size: number[], klass?: string) {
    super(size, klass, true);
    var buffer_size = this._numel * this._data_ctor.BYTES_PER_ELEMENT;
    if (this._numel == 0) {
      // buffer of 0 byte cannot be constructed, but allocate buffer to avoid exception
      buffer_size = 4;
    }
    this._clbuffer = $CL.createBuffer(buffer_size);
  }

  to_cpu(): Matrix {
    var cpumat = new Matrix(this._size, this._klass);
    this.read(cpumat._data);
    return cpumat;
  }

  private throw_if_destructed() {
    if (!this._clbuffer) {
      throw new Error('Attempting use destructed matrix');
    }
  }

  write(src_typed_array: any, dst_bytes_offset?: number) {
    this.throw_if_destructed();
    if (src_typed_array.length > 0) {
      $CL.writeBuffer(this._clbuffer, src_typed_array, dst_bytes_offset);
    }
  }

  read(dst_typed_array: any, src_bytes_offset?: number) {
    this.throw_if_destructed();
    if (dst_typed_array.length > 0) {
      $CL.readBuffer(this._clbuffer, dst_typed_array, src_bytes_offset);
    }
  }

  static _fromnativemat(A: Matrix): MatrixCL {
    if (A instanceof MatrixCL) {
      return <MatrixCL>A.copy();
    } else {
      var matcl = new MatrixCL(A._size, A._klass);
      matcl.write(A._getdata());
      return matcl;
    }
  }

  static _fromtypedarray(src_typed_array: typedef.AllowedTypedArray, klass: string): MatrixCL {
    var mat = new MatrixCL([1, src_typed_array.length], klass);
    mat.write(src_typed_array);
    return mat;
  }

  destruct() {
    if (this._clbuffer) {
      $CL.releaseBuffer(this._clbuffer);
      this._clbuffer = null;
    }
  }

  inspect(depth: number): string {
    var shape_str = this._size.join('x');
    if (this._numel <= 100) {
      return 'MatrixCL ' + shape_str + ' ' + this._klass + '\n' + this.toString();
    } else {
      return 'MatrixCL ' + shape_str + ' ' + this._klass;
    }
  }

  _getdata(): typedef.AllowedTypedArray {
    //get copy of data in TypedArray
    var typed_array = new this._data_ctor(this._numel);
    this.read(typed_array);
    return typed_array;
  }

  getdataref(src_offset: number = 0, length?: number): typedef.AllowedTypedArray {
    //get read-only view of array
    // copy minimum range of gpu array
    if (length == null) {
      length = this._numel - src_offset;
    }
    var typed_array = new this._data_ctor(length);
    this.read(typed_array, src_offset * this._data_ctor.BYTES_PER_ELEMENT);
    return typed_array;
  }

  getdatacopy(src_offset: number = 0, length?: number, dst?: typedef.AllowedTypedArray): typedef.AllowedTypedArray {
    if (length == null) {
      length = this._numel - src_offset;
    }
    if (!dst) {
      dst = new this._data_ctor(length);
    }

    var range_view = new this._data_ctor(dst.buffer, 0, length);
    this.read(range_view, src_offset * this._data_ctor.BYTES_PER_ELEMENT);

    return dst;
  }

  setdata(src: typedef.AllowedTypedArray, dst_offset: number = 0): void {
    //set raw data into buffer
    this.write(src, dst_offset * this._data_ctor.BYTES_PER_ELEMENT);
  }

  static get_cast_str(dst_klass: string, src_klass: string): string {
    var cast_str: string;
    if (src_klass == dst_klass) {
      cast_str = '(x)';
    } else if (dst_klass != 'logical') {
      cast_str = '(' + dst_klass + ')(x)';
    } else {
      cast_str = '((x != 0) ? 1 : 0)';
    }
    return cast_str;
  }

  copy(klass?: string): Matrix {
    var clone = new MatrixCL(this._size, klass || this._klass);
    var kernel_name = 'copy_' + clone._klass + '_' + this._klass;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define DST_TYPE ' + ctypes[clone._klass],
        '#define SRC_TYPE ' + ctypes[this._klass],
        '#define TYPE_CAST(x) ' + MatrixCL.get_cast_str(clone._klass, this._klass),
        '__kernel void kernel_func(__global DST_TYPE *dst, __global SRC_TYPE *src, uint length) {',
        '  uint i = get_global_id(0);',
        '  if (i >= length) { return; }',
        '  dst[i] = TYPE_CAST(src[i]);',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (this._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: clone },
        { access: WebCL.MEM_READ_ONLY, datum: this },
        { datum: this._numel, type: WebCL.type.UINT }
      ], this._numel);
    }
    return clone;
  }

  _fill(val: number): void {
    var kernel_name = 'fill_' + this._klass;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define DST_TYPE ' + ctypes[this._klass],
        '__kernel void kernel_func(__global DST_TYPE *dst, uint length, DST_TYPE val) {',
        '  uint i = get_global_id(0);',
        '  if (i >= length) { return; }',
        '  dst[i] = val;',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (this._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: this },
        { datum: this._numel, type: WebCL.type.UINT },
        { datum: val, type: webcltypes[this._klass] }
      ], this._numel);
    }
  }

  get(): number;
  get(...args: number[]): number;
  get(...args: any[]): Matrix;
  get(...args: any[]): any {
    if (args.length == 0) {
      // get scalar
      return this.get_scalar([1]);
    }
    var all_number = args.every((v) => typeof (v) === 'number');
    if (all_number) {
      return this.get_scalar(args);
    } else {
      // if (args.length > 1) {
      return this.get_matrix_nd(args);
      // } else {
      //   if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
      //     return this.get_matrix_logical(args[0]);
      //   } else {
      //     return this.get_matrix_single(args[0]);
      //   }
      // }
    }
  }

  get_scalar(inds: number[]): number {
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    var dst_typed_array = new this._data_ctor(1);//read only 1 element
    this.read(dst_typed_array, arrayidx * this._data_ctor.BYTES_PER_ELEMENT);
    return dst_typed_array[0];
  }

  private static _get_ind_iterator_cl(ind: (number | Colon | Matrix), dim_size: number): { kernel_arg: { access?: any, datum: any, type?: any }, to_destruct: MatrixCL, length: number, typename: string } {
    // return index within valid range
    if (typeof (ind) === 'number') {
      var ind_positive = <number>ind;
      if (ind_positive < 0) {//end-xxx
        ind_positive += dim_size + 1;
      }
      if (ind_positive <= 0 || ind_positive > dim_size) {
        throw Error('Index exceeds matrix dimension');
      }
      return {
        kernel_arg: { datum: ind_positive, type: webcltypes.int32 },
        to_destruct: null, length: 1,
        typename: 'int'
      };
    } else if (ind instanceof Colon) {
      var start = ind.start;
      var stop = ind.stop;
      var step = ind.step;
      if (ind.all) {
        start = 1;
        stop = dim_size;
        step = 1;
      }
      if (start < 0) {
        start += dim_size + 1;
      }
      if (stop < 0) {
        stop += dim_size + 1;
      }
      var length: number = 0;
      if ((step > 0 && stop >= start) || (step < 0 && stop <= start)) {
        length = Math.floor((stop - start) / step) + 1;
        // check if in valid range
        var final_value = start + step * (length - 1);
        if ((start <= 0 || start > dim_size) || (final_value <= 0 || final_value > dim_size)) {
          throw Error('Index exceeds matrix dimension');
        }
      }
      return {
        kernel_arg: { datum: [start, step, stop, length], type: webcltypes.int32 | WebCL.type.VEC4 },
        to_destruct: null,
        length: length,
        typename: 'int4'
      }
    } else if (ind instanceof Matrix) {
      var to_destruct = null;
      var ind_mat: MatrixCL;
      if (ind instanceof MatrixCL) {
        ind_mat = ind;
      } else {
        ind_mat = MatrixCL._fromnativemat(ind);
        to_destruct = ind_mat;
      }
      // check if in valid range

      var kernel_name = '_get_ind_iterator_cl_' + ind._klass;
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        var kernel_str = [
          '#define SRC_TYPE ' + ctypes[ind._klass],
          '__kernel void kernel_func(__global int *dst, __global const SRC_TYPE *src, int dim_size, uint src_length) {',
          '  uint i = get_global_id(0);',
          '  if (i >= src_length) { return; }',
          '  int src_val = (int)src[i];',
          '  if (src_val == 0 || src_val > dim_size || src_val < -dim_size) {',
          '    dst[0] = 1;',
          '  }',
          '}'
        ].join('\n');
        kernel = $CL.createKernel(kernel_str);
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }
      if (ind_mat._numel > 0) {
        var validity_result = new MatrixCL([1, 1], 'int32');
        validity_result._fill(0);
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: validity_result },
          { access: WebCL.MEM_READ_ONLY, datum: ind_mat },
          { datum: dim_size, type: WebCL.type.INT },
          { datum: ind_mat._numel, type: WebCL.type.UINT }
        ], ind_mat._numel);
        if (validity_result.getdataref()[0]) {
          validity_result.destruct();
          if (to_destruct) {
            to_destruct.destruct();
          }
          throw Error('Index exceeds matrix dimension');
        }
        validity_result.destruct();
      }

      return {
        kernel_arg: { datum: ind_mat, access: WebCL.MEM_READ_ONLY },
        to_destruct: to_destruct,
        length: ind_mat._numel,
        typename: '__global ' + ctypes[ind_mat._klass] + ' *'
      }
    }
  }

  get_matrix_nd(inds: (number | Colon | Matrix)[]): Matrix {
    var inds_ndim = inds.length;
    var destruct_targets: Matrix[] = [];
    try {
      // replace logical matrix with vector
      for (var i = 0; i < inds_ndim; i++) {
        var ind = inds[i];
        if (ind instanceof Matrix) {
          if (ind._klass == 'logical') {
            var idxarray = ind._find();
            inds[i] = idxarray
            destruct_targets.push(idxarray);
          }
        }
      }

      var virtual_input_shape: number[] = [];
      if (this._ndims <= inds_ndim) {
        // pad with 1
        virtual_input_shape = this._size.concat();
        while (virtual_input_shape.length < inds_ndim) {
          virtual_input_shape.push(1);
        }
      } else {
        // last dimension is like linear index
        let cur_prod = 1;
        for (let dim = 0; dim < inds_ndim - 1; dim++) {
          virtual_input_shape.push(this._size[dim]);
          cur_prod *= this._size[dim];
        }
        virtual_input_shape.push(this._numel / cur_prod);
      }
      var virtual_input_stride: number[] = [];
      var stride_tmp = 1;
      for (var dim = 0; dim < inds_ndim; dim++) {
        virtual_input_stride.push(stride_tmp);
        stride_tmp *= virtual_input_shape[dim];
      }

      var kernel_args = [];
      var kernel_type_names = [];
      var dst_shape = [];
      var dst_stride = [];//not use dst._strides because tailing 1 dimension is omitted
      var dst_stride_tmp = 1;
      for (var dim = 0; dim < inds_ndim; dim++) {
        var iter_and_length = MatrixCL._get_ind_iterator_cl(inds[dim], virtual_input_shape[dim]);
        if (iter_and_length.to_destruct) {
          destruct_targets.push(iter_and_length.to_destruct);
        }
        kernel_args.push(iter_and_length.kernel_arg);
        kernel_type_names.push(iter_and_length.typename);
        dst_shape.push(iter_and_length.length);
        dst_stride.push(dst_stride_tmp);
        dst_stride_tmp *= iter_and_length.length;
      }
      var dst_numel = dst_stride_tmp;

      var dst_reshape_shape = null;
      if (inds_ndim == 1) {
        // linear indexing case
        dst_shape.push(1);//avoid error on new Matrix()
        // if ind is logical matrix, regarded as vector in the following
        // colon is row vector
        // src and ind are both vectors => follows direction of src
        // otherwise: follows ind's shape
        var is_ind_vector = false;
        var only_ind = inds[0];
        if (only_ind instanceof Matrix) {
          if (only_ind._ndims == 2 && (only_ind._size[0] == 1 || only_ind._size[1] == 1)) {
            is_ind_vector = true;
          }
        } else if (only_ind instanceof Colon) {
          is_ind_vector = true;
        }
        var is_src_vector = false;
        if (this._ndims == 2 && (this._size[0] == 1 || this._size[1] == 1)) {
          is_src_vector = true;
        }

        if (is_src_vector && is_ind_vector) {
          // follow direction of src
          if (this._size[0] == 1) {
            // reshape to row vector
            dst_reshape_shape = [1, dst_shape[0]];
          }
        } else {
          // follow ind's shape
          if (only_ind instanceof Matrix) {
            dst_reshape_shape = only_ind._size;
          } else if (only_ind instanceof Colon) {
            // reshape to row vector
            dst_reshape_shape = [1, dst_shape[0]];
          }
        }
      }

      var dst = new MatrixCL(dst_shape, this._klass);
      var kernel_name = 'get_matrix_nd_' + this._klass + '_' + inds_ndim + '_' + kernel_type_names.join(',');
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        var kernel_index_args_str = '';
        for (var dim = 0; dim < inds_ndim; dim++) {
          kernel_index_args_str += ',' + kernel_type_names[dim] + ' ind' + dim;//variable ind0, ind1, ...
        }

        var kernel_add_dim = '';
        for (var dim = 0; dim < inds_ndim; dim++) {
          kernel_add_dim += 'ADD_IND(' + dim + ');';
        }

        var kernel_get_ind_func = '';
        for (var dim = 0; dim < inds_ndim; dim++) {
          kernel_get_ind_func += 'int get_ind' + dim;
          var kernel_type_name = kernel_type_names[dim];
          switch (kernel_type_name) {
            case 'int':
              kernel_get_ind_func += '(int indexer, int offset, int dim_size) {return indexer;}';
              break;
            case 'int4':
              kernel_get_ind_func += '(int4 indexer, int offset, int dim_size) {return indexer.x + indexer.y * offset;}';
              break;
            default:
              kernel_get_ind_func += '(' + kernel_type_name + ' indexer, int offset, int dim_size) {int val = (int)indexer[offset]; if (val < 0) { return val + dim_size + 1; } else { return val; }}';
              break;
          }
          kernel_get_ind_func += '\n';
        }

        var kernel_str = [
          '#define DIMS ' + inds_ndim,
          '#define SRC_DST_TYPE ' + ctypes[this._klass],
          kernel_get_ind_func,
          '#define ADD_IND(dim) {dst_coord = (i / dst_stride[dim]) % dst_shape[dim]; src_coord = (get_ind ## dim(ind ## dim, dst_coord, src_shape[dim])) - 1; src_linear_index += src_coord * src_stride[dim];}',
          '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global const SRC_DST_TYPE *src, __global const int *size_strides, uint output_length',
          kernel_index_args_str,
          ') {',
          '  uint i = get_global_id(0);',
          '  if (i >= output_length) { return; }',
          '  __global const int *src_stride = size_strides, *src_shape = size_strides + DIMS * 1, *dst_stride = size_strides + DIMS * 2, *dst_shape = size_strides + DIMS * 3;',
          '  int dst_coord, src_coord;',
          '  int src_linear_index = 0;',
          kernel_add_dim,
          '  dst[i] = src[src_linear_index];',
          '}'
        ].join('\n');
        kernel = $CL.createKernel(kernel_str);

        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      if (dst_numel > 0) {
        var size_strides = [];//src_stride/src_shape/dst_stride/dst_shape; dst_shape is last because [1] may be added above
        size_strides.push(...virtual_input_stride);
        size_strides.push(...virtual_input_shape);
        size_strides.push(...dst_stride);
        size_strides.push(...dst_shape);

        var size_strides_mat = MatrixCL._fromtypedarray(new Int32Array(size_strides), 'int32');
        destruct_targets.push(size_strides_mat);

        kernel_args.unshift({ access: WebCL.MEM_WRITE_ONLY, datum: dst },
          { access: WebCL.MEM_READ_ONLY, datum: this },
          { access: WebCL.MEM_READ_ONLY, datum: size_strides_mat },
          { datum: dst_numel, type: WebCL.type.UINT });
        $CL.executeKernel(kernel, kernel_args, dst_numel);

      }

      if (dst_reshape_shape) {
        dst.reshape_inplace(dst_reshape_shape);
      }

      return dst;
    } finally {
      for (var i = 0; i < destruct_targets.length; i++) {
        destruct_targets[i].destruct();
      }
    }
  }

  get_matrix_nd_old(inds: (number | Colon | Matrix)[]): Matrix {
    //multidim indexing
    //convert index of each dimension into array
    var dims = inds.length;
    var eachdimidx: (number[] | AllowedTypedArray)[] = [];
    var eachdimidx_totallen = 0;
    var eachdimstride = new Int32Array(dims);
    var output_size: number[] = [];
    var output_length = 1;
    for (var dim = 0; dim < dims; dim++) {
      var dimind = inds[dim];
      var dimidx;
      if (dimind instanceof Colon) {
        dimidx = dimind.tojsa(this._size[dim] || 1);
      } else if (dimind instanceof Matrix) {
        dimidx = dimind._getdata();
      } else {
        //number
        dimidx = [<number>dimind];
      }

      //range check
      var dim_size = this._size[dim] || 1;//exceed dimension must be [1,1,...]
      for (var i = 0; i < dimidx.length; i++) {
        if ((dimidx[i] > dim_size) || (dimidx[i] < 1)) {
          throw new Error('Index exceeds matrix dimension');
        }
      }

      eachdimidx.push(dimidx);
      eachdimidx_totallen += dimidx.length;
      eachdimstride[dim] = this._strides[dim] || 0;
      output_size.push(dimidx.length);
      output_length *= dimidx.length;
    }
    var eachdimidx_combined = new Int32Array(eachdimidx_totallen);
    var eachdimidx_offset = new Int32Array(dims);
    var eachdimidx_combined_offset = 0;
    for (var dim = 0; dim < dims; dim++) {
      eachdimidx_combined.set(eachdimidx[dim], eachdimidx_combined_offset);
      eachdimidx_offset[dim] = eachdimidx_combined_offset;
      eachdimidx_combined_offset += eachdimidx[dim].length;
    }

    var output = new MatrixCL(output_size, this._klass);
    var kernel_name = 'get_matrix_nd_' + this._klass + '_' + dims;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define DIMS ' + dims,
        '#define SRC_DST_TYPE ' + ctypes[output._klass],
        '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global const SRC_DST_TYPE *src, __global const int *eachdimidx_combined,',
        '__global const int *eachdimidx_offset, __global const int *eachdimidx_size, __global const int *strides, uint output_length) {',
        '  uint i = get_global_id(0);',
        '  if (i >= output_length) { return; }',
        '  uint remain_i = i;',
        '  int inds[DIMS];',
        '  int input_raw_idx = 0;',
        '  for (int dim = 0; dim < DIMS; dim++) {',
        '    __global const int *eachdimidx_dim = eachdimidx_combined + eachdimidx_offset[dim];',
        '    input_raw_idx += (eachdimidx_dim[remain_i % eachdimidx_size[dim]] - 1) * strides[dim];',
        '    remain_i /= eachdimidx_size[dim];',
        '  }',
        '  dst[i] = src[input_raw_idx];',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (output_length > 0) {
      var eachdimidx_combined_mat = MatrixCL._fromtypedarray(eachdimidx_combined, 'int32');
      var eachdimidx_offset_mat = MatrixCL._fromtypedarray(eachdimidx_offset, 'int32');
      var eachdimidx_size_mat = MatrixCL._fromtypedarray(new Int32Array(output_size), 'int32');
      var strides_mat = MatrixCL._fromtypedarray(eachdimstride, 'int32');
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: output },
        { access: WebCL.MEM_READ_ONLY, datum: this },
        { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_combined_mat },
        { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_offset_mat },
        { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_size_mat },
        { access: WebCL.MEM_READ_ONLY, datum: strides_mat },
        { datum: output_length, type: WebCL.type.UINT }
      ], output_length);
      eachdimidx_combined_mat.destruct();
      eachdimidx_offset_mat.destruct();
      strides_mat.destruct();
    }

    return output;
  }

  get_matrix_single(singleind: Colon | Matrix): Matrix {
    var single_idx_array: number[] | AllowedTypedArray;
    var output_size: number[];
    var index_mat: MatrixCL;
    var destruct_index_mat = true;
    if (singleind instanceof Colon) {
      single_idx_array = singleind.tojsa(this._numel);
      output_size = [1, single_idx_array.length];//row vector
      index_mat = MatrixCL._fromtypedarray(new Int32Array(single_idx_array), 'int32');
    } else if (singleind instanceof MatrixCL) {
      // returns matrix of same shape
      // value in matrix is used as linear index
      index_mat = singleind;
      destruct_index_mat = false;
      output_size = singleind._size;
    } else if (singleind instanceof Matrix) {
      index_mat = MatrixCL._fromnativemat(singleind);
      output_size = singleind._size;
    }

    try {
      var output = new MatrixCL(output_size, this._klass);
      var kernel_name = 'get_matrix_single_' + this._klass + '_' + index_mat._klass;
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        kernel = $CL.createKernel([
          '#define SRC_DST_TYPE ' + ctypes[output._klass],
          '#define INDEX_TYPE ' + ctypes[index_mat._klass],
          '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src, __global INDEX_TYPE *index, uint index_length) {',
          '  uint i = get_global_id(0);',
          '  if (i >= index_length) { return; }',
          '  dst[i] = src[(uint)index[i]-1];',
          '}'
        ].join('\n'));
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      if (index_mat._numel > 0) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: output },
          { access: WebCL.MEM_READ_ONLY, datum: this },
          { access: WebCL.MEM_READ_ONLY, datum: index_mat },
          { datum: index_mat._numel, type: WebCL.type.UINT }
        ], index_mat._numel);
      }

    } catch (error) {
      throw error;
    } finally {
      if (destruct_index_mat) {
        index_mat.destruct();
      }

    }


    return output;
  }

  get_matrix_logical(map: Matrix): MatrixCL {
    // equivalent to this.get(find(map))

    //not paralleled; very slow

    //first, count output size
    var map_cl: MatrixCL;
    var destruct_map_cl = false;
    if (map instanceof MatrixCL) {
      map_cl = map;
    } else {
      map_cl = MatrixCL._fromnativemat(map);
      destruct_map_cl = true;
    }

    try {
      var count_mat = new MatrixCL([1, 2], 'int32');
      var kernel_name = 'get_matrix_logical_count';
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        kernel = $CL.createKernel([
          '#define SRC_DST_TYPE ' + ctypes[this._klass],
          '__kernel void kernel_func(__global int *count, __global uchar *logical_index, uint index_length) {',
          '  int ctr = 0;',
          '  int max_i = -1;',
          '  if (get_global_id(0) > 0) {return;}',
          '  for (uint i = 0; i < index_length; i++) {',
          '    uchar val = logical_index[i];',
          '    if (val) {',
          '      ctr++;',
          '      max_i = i;',
          '    }',
          '  }',
          '  count[0] = ctr;',
          '  count[1] = max_i;',
          '}'
        ].join('\n'));
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      var count_array = new Int32Array(2);//default value 0
      if (map_cl._numel > 0) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: count_mat },
          { access: WebCL.MEM_READ_ONLY, datum: map_cl },
          { datum: map_cl._numel, type: WebCL.type.UINT }
        ], 1);
        count_mat.read(count_array);
      }

      var output_length = count_array[0];
      var max_i = count_array[1];

      //second, read sequentially and write
      if (this._numel <= max_i) {
        throw new Error('Index out of bounds');
      }

      var output = new MatrixCL([output_length, 1], this._klass);
      var kernel_name = 'get_matrix_logical_' + this._klass;
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        kernel = $CL.createKernel([
          '#define SRC_DST_TYPE ' + ctypes[this._klass],
          '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src, __global uchar *logical_index, uint output_length) {',
          '  uint i = get_global_id(0);',
          '  if (i > 0) { return; }',
          '  int out_idx = 0;',
          '  int in_idx = 0;',
          '  while (out_idx < output_length) {',
          '    if (logical_index[in_idx]) {',
          '      dst[out_idx++] = src[in_idx];',
          '    }',
          '    in_idx++;',
          '  }',
          '}'
        ].join('\n'));
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      if (output_length > 0) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: output },
          { access: WebCL.MEM_READ_ONLY, datum: this },
          { access: WebCL.MEM_READ_ONLY, datum: map_cl },
          { datum: output_length, type: WebCL.type.UINT }
        ], 1);
      }

    } finally {
      count_mat.destruct();
      if (destruct_map_cl) {
        map_cl.destruct();
      }
    }

    return output;
  }

  set(ind: number | Matrix | Colon, val: number | Matrix | any[]): void;
  set(row: number | Matrix | Colon, col: number | Matrix | Colon, val: number | Matrix | any[]): void;
  set(...args: any[]): void;
  set(...args: any[]): void {
    //last argument is value, but subsequent function requires first argument to be value
    var val = args.pop();
    if (!(val instanceof Matrix) && val.length !== void 0) {
      // js array (or array-like)
      val = Matrix.jsa2mat(val, false, this._klass);
    }
    // scalar matrix converted to number
    if (val instanceof Matrix && val._numel == 1) {
      val = (<Matrix>val).get_scalar([1]);
    }

    var all_number = args.every((v) => typeof (v) === 'number');
    if (all_number) {
      this.set_scalar(val, args);
    } else {
      // if (args.length > 1) {
      this.set_matrix_nd(val, args);
      // } else {
      //   if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
      //     this.set_matrix_logical(val, args[0]);
      //   } else {
      //     this.set_matrix_single(val, args[0]);
      //   }
      // }
    }
  }

  set_scalar(val: number | Matrix, inds: number[]): void {
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    var scalar_val: number;
    if (val instanceof Matrix) {
      if (val._numel != 1) {
        throw new Error('Value is not scalar');
      }
      scalar_val = val.get_scalar([1]);
    } else {
      scalar_val = <number>val;
    }

    if (Matrix._logical_cast_required(this._klass)) {
      scalar_val = Matrix._logical_cast(scalar_val);
    }

    var typed_array = new this._data_ctor(1);
    typed_array[0] = scalar_val;
    this.write(typed_array, arrayidx * this._data_ctor.BYTES_PER_ELEMENT);
  }

  static cast_scalar_val(val: number, klass: string): number {
    switch (klass) {
      case 'int32':
        val = val | 0;
        break;
      case 'uint8':
        val = val & 0xFF;
        break;
      case 'logical':
        val = val ? 1 : 0;
        break;
    }
    return val;
  }

  set_matrix_single(val: number | Matrix, singleind: Colon | Matrix): void {
    var index_mat: MatrixCL;
    var destruct_index_mat = true;
    var val_mat: MatrixCL;
    var destruct_val_mat = false;
    var input_size: number[];
    if (singleind instanceof Colon) {
      var single_idx_array = singleind.tojsa(this._numel);
      input_size = [1, single_idx_array.length];//row vector
      index_mat = new MatrixCL(input_size, 'int32');
      index_mat.write(new Int32Array(single_idx_array));
    } else if (singleind instanceof MatrixCL) {
      index_mat = singleind;
      destruct_index_mat = false;
    } else if (singleind instanceof Matrix) {
      index_mat = MatrixCL._fromnativemat(singleind);
    }

    try {
      if (val instanceof Matrix) {
        if (index_mat._numel != val._numel) {
          throw new Error('Dimension mismatch');
        }

        if (val instanceof MatrixCL) {
          val_mat = val;
        } else {
          val_mat = MatrixCL._fromnativemat(val);
          destruct_val_mat = true;
        }

        var kernel_name = 'set_matrix_single_matrix_' + this._klass + '_' + val_mat._klass + '_' + index_mat._klass;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
          kernel = $CL.createKernel([
            '#define SRC_TYPE ' + ctypes[val_mat._klass],
            '#define DST_TYPE ' + ctypes[this._klass],
            '#define INDEX_TYPE ' + ctypes[index_mat._klass],
            '#define TYPE_CAST(x) ' + MatrixCL.get_cast_str(this._klass, val_mat._klass),
            '__kernel void kernel_func(__global DST_TYPE *dst, __global SRC_TYPE *src, __global INDEX_TYPE *index, uint index_length) {',
            '  uint i = get_global_id(0);',
            '  if (i >= index_length) { return; }',
            '  dst[(uint)index[i]-1] = TYPE_CAST(src[i]);',
            '}'
          ].join('\n'));
          MatrixCL.kernel_cache[kernel_name] = kernel;
        }
        if (index_mat._numel > 0) {
          $CL.executeKernel(kernel, [
            { access: WebCL.MEM_WRITE_ONLY, datum: this },
            { access: WebCL.MEM_READ_ONLY, datum: val_mat },
            { access: WebCL.MEM_READ_ONLY, datum: index_mat },
            { datum: index_mat._numel, type: WebCL.type.UINT }
          ], index_mat._numel);
        }
      } else {
        var kernel_name = 'set_matrix_single_scalar_' + this._klass + '_' + index_mat._klass;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
          kernel = $CL.createKernel([
            '#define DST_TYPE ' + ctypes[this._klass],
            '#define INDEX_TYPE ' + ctypes[index_mat._klass],
            '__kernel void kernel_func(__global DST_TYPE *dst, DST_TYPE src, __global INDEX_TYPE *index, uint index_length) {',
            '  uint i = get_global_id(0);',
            '  if (i >= index_length) { return; }',
            '  dst[(uint)index[i]-1] = src;',
            '}'
          ].join('\n'));
          MatrixCL.kernel_cache[kernel_name] = kernel;
        }
        var scalar_val = MatrixCL.cast_scalar_val(<number>val, this._klass);
        if (index_mat._numel > 0) {
          $CL.executeKernel(kernel, [
            { access: WebCL.MEM_WRITE_ONLY, datum: this },
            { datum: scalar_val, type: webcltypes[this._klass] },
            { access: WebCL.MEM_READ_ONLY, datum: index_mat },
            { datum: index_mat._numel, type: WebCL.type.UINT }
          ], index_mat._numel);
        }
      }
    } catch (error) {
      throw error;
    } finally {
      if (destruct_index_mat) {
        index_mat.destruct();
      }
    }

  }


  set_matrix_nd(val: number | Matrix, inds: (number | Colon | Matrix)[]): void {
    var inds_ndim = inds.length;
    var destruct_targets: Matrix[] = [];
    try {
      // replace logical matrix with vector
      for (var i = 0; i < inds_ndim; i++) {
        var ind = inds[i];
        if (ind instanceof Matrix) {
          if (ind._klass == 'logical') {
            var idxarray = ind._find();
            inds[i] = idxarray
            destruct_targets.push(idxarray);
          }
        }
      }

      var virtual_input_shape: number[] = [];
      if (this._ndims <= inds_ndim) {
        // pad with 1
        virtual_input_shape = this._size.concat();
        while (virtual_input_shape.length < inds_ndim) {
          virtual_input_shape.push(1);
        }
      } else {
        // last dimension is like linear index
        let cur_prod = 1;
        for (let dim = 0; dim < inds_ndim - 1; dim++) {
          virtual_input_shape.push(this._size[dim]);
          cur_prod *= this._size[dim];
        }
        virtual_input_shape.push(this._numel / cur_prod);
      }
      var virtual_input_stride: number[] = [];
      var stride_tmp = 1;
      for (var dim = 0; dim < inds_ndim; dim++) {
        virtual_input_stride.push(stride_tmp);
        stride_tmp *= virtual_input_shape[dim];
      }

      var kernel_args = [];
      var kernel_type_names = [];
      var dst_shape = [];
      var dst_stride = [];//not use dst._strides because tailing 1 dimension is omitted
      var dst_stride_tmp = 1;
      var squeezed_dst_shape = [];
      for (var dim = 0; dim < inds_ndim; dim++) {
        var iter_and_length = MatrixCL._get_ind_iterator_cl(inds[dim], virtual_input_shape[dim]);
        if (iter_and_length.to_destruct) {
          destruct_targets.push(iter_and_length.to_destruct);
        }
        kernel_args.push(iter_and_length.kernel_arg);
        kernel_type_names.push(iter_and_length.typename);
        dst_shape.push(iter_and_length.length);
        if (iter_and_length.length != 1) {
          squeezed_dst_shape.push(iter_and_length.length);
        }
        dst_stride.push(dst_stride_tmp);
        dst_stride_tmp *= iter_and_length.length;
      }
      var dst_numel = dst_stride_tmp;

      var val_is_matrix = false;
      if (val instanceof Matrix) {
        if ((<Matrix>val)._numel == 1) {
          //1x1 mat: treat as scalar
          val = (<Matrix>val).get();
        } else {
          val_is_matrix = true;
          if (!(val instanceof MatrixCL)) {
            // cpu matrix
            val = MatrixCL._fromnativemat(<Matrix>val);
            destruct_targets.push(<Matrix>val);
          }
        }
      }

      if (val_is_matrix) {
        // check shape
        // squeezed_dst_shape is 1-d, number of element must match
        // otherwise, squeezed shape of val must match
        var val_numel = (<Matrix>val)._numel;

        var raise_error = false;
        if (squeezed_dst_shape.length == 0) {
          // set of scalar
          if (val_numel != 1) {
            raise_error = true;
          }
        } else if (squeezed_dst_shape.length == 1) {
          if (val_numel != squeezed_dst_shape[0]) {
            raise_error = true;
          }
        } else {
          var val_shape = (<Matrix>val)._size;
          var squeezed_val_shape = val_shape.filter((v) => v != 1);
          if (!squeezed_val_shape.every((v, i) => v == squeezed_dst_shape[i])) {
            raise_error = true;
          }
        }

        if (raise_error) {
          throw new Error('The shape of matrix does not fit');
        }
      }

      var kernel_name = 'set_matrix_nd_' + this._klass + '_' + val_is_matrix + '_' + inds_ndim + '_' + kernel_type_names.join(',');
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        var kernel_index_args_str = '';
        for (var dim = 0; dim < inds_ndim; dim++) {
          kernel_index_args_str += ',' + kernel_type_names[dim] + ' ind' + dim;//variable ind0, ind1, ...
        }

        var kernel_add_dim = '';
        for (var dim = 0; dim < inds_ndim; dim++) {
          kernel_add_dim += 'ADD_IND(' + dim + ');';
        }

        var kernel_get_ind_func = '';
        for (var dim = 0; dim < inds_ndim; dim++) {
          kernel_get_ind_func += 'int get_ind' + dim;
          var kernel_type_name = kernel_type_names[dim];
          switch (kernel_type_name) {
            case 'int':
              kernel_get_ind_func += '(int indexer, int offset, int dim_size) {return indexer;}';
              break;
            case 'int4':
              kernel_get_ind_func += '(int4 indexer, int offset, int dim_size) {return indexer.x + indexer.y * offset;}';
              break;
            default:
              kernel_get_ind_func += '(' + kernel_type_name + ' indexer, int offset, int dim_size) {int val = (int)indexer[offset]; if (val < 0) { return val + dim_size + 1; } else { return val; }}';
              break;
          }
          kernel_get_ind_func += '\n';
        }

        var kernel_str = [
          '#define DIMS ' + inds_ndim,
          '#define SRC_DST_TYPE ' + ctypes[this._klass],
          kernel_get_ind_func,
          '#define ADD_IND(dim) {dst_coord = (i / dst_stride[dim]) % dst_shape[dim]; src_coord = (get_ind ## dim(ind ## dim, dst_coord, src_shape[dim])) - 1; src_linear_index += src_coord * src_stride[dim];}',
          '__kernel void kernel_func(',
          val_is_matrix ? '__global const SRC_DST_TYPE *dst' : 'SRC_DST_TYPE dst',
          ', __global SRC_DST_TYPE *src, __global const int *size_strides, uint output_length',
          kernel_index_args_str,
          ') {',
          '  uint i = get_global_id(0);',
          '  if (i >= output_length) { return; }',
          '  __global const int *src_stride = size_strides, *src_shape = size_strides + DIMS * 1, *dst_stride = size_strides + DIMS * 2, *dst_shape = size_strides + DIMS * 3;',
          '  int dst_coord, src_coord;',
          '  int src_linear_index = 0;',
          kernel_add_dim,
          val_is_matrix ? '  src[src_linear_index] = dst[i];' : '  src[src_linear_index] = dst;',
          '}'
        ].join('\n');
        kernel = $CL.createKernel(kernel_str);

        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      if (dst_numel > 0) {
        var size_strides = [];//src_stride/src_shape/dst_stride/dst_shape; dst_shape is last because [1] may be added above
        size_strides.push(...virtual_input_stride);
        size_strides.push(...virtual_input_shape);
        size_strides.push(...dst_stride);
        size_strides.push(...dst_shape);

        var size_strides_mat = MatrixCL._fromtypedarray(new Int32Array(size_strides), 'int32');
        destruct_targets.push(size_strides_mat);

        kernel_args.unshift(
          { access: WebCL.MEM_WRITE_ONLY, datum: this },
          { access: WebCL.MEM_READ_ONLY, datum: size_strides_mat },
          { datum: dst_numel, type: WebCL.type.UINT });
        if (val_is_matrix) {
          kernel_args.unshift({ access: WebCL.MEM_READ_ONLY, datum: val });
        } else {
          kernel_args.unshift({ datum: <number>val, type: webcltypes[this._klass] });
        }
        $CL.executeKernel(kernel, kernel_args, dst_numel);

      }

    } finally {
      for (var i = 0; i < destruct_targets.length; i++) {
        destruct_targets[i].destruct();
      }
    }
  }

  set_matrix_nd_old(val: number | Matrix, inds: (number | Colon | Matrix)[]): void {
    //multidim indexing
    //convert index of each dimension into array
    var dims = inds.length;
    var eachdimidx: (number[] | AllowedTypedArray)[] = [];
    var eachdimidx_totallen = 0;
    var eachdimstride = new Int32Array(dims);
    var output_size: number[] = [];
    var output_length = 1;
    var val_mat: MatrixCL;
    var destruct_val_mat = false;
    for (var dim = 0; dim < dims; dim++) {
      var dimind = inds[dim];
      var dimidx;
      if (dimind instanceof Colon) {
        dimidx = dimind.tojsa(this._size[dim] || 1);
      } else if (dimind instanceof Matrix) {
        dimidx = dimind._getdata();
      } else {
        //number
        dimidx = [<number>dimind];
      }

      //range check
      var dim_size = this._size[dim] || 1;//exceed dimension must be [1,1,...]
      for (var i = 0; i < dimidx.length; i++) {
        if ((dimidx[i] > dim_size) || (dimidx[i] < 1)) {
          throw new Error('Index exceeds matrix dimension');
        }
      }

      eachdimidx.push(dimidx);
      eachdimidx_totallen += dimidx.length;
      eachdimstride[dim] = this._strides[dim] || 0;
      output_size.push(dimidx.length);
      output_length *= dimidx.length;
    }
    var eachdimidx_combined = new Int32Array(eachdimidx_totallen);
    var eachdimidx_offset = new Int32Array(dims);
    var eachdimidx_combined_offset = 0;
    for (var dim = 0; dim < dims; dim++) {
      eachdimidx_combined.set(eachdimidx[dim], eachdimidx_combined_offset);
      eachdimidx_offset[dim] = eachdimidx_combined_offset;
      eachdimidx_combined_offset += eachdimidx[dim].length;
    }

    try {
      if (val instanceof Matrix) {
        for (var dim = 0; dim < Math.max(output_size.length, val._size.length); dim++) {
          if ((output_size[dim] || 1) != (val._size[dim] || 1)) {
            //TODO: not exactly correct when dim is 0
            throw new Error('Dimension mismatch');
          }
        }

        if (val instanceof MatrixCL) {
          val_mat = val;
        } else {
          val_mat = MatrixCL._fromnativemat(val);
          destruct_val_mat = true;
        }

        var kernel_name = 'set_matrix_nd_' + this._klass + '_' + val_mat._klass + '_' + dims;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
          kernel = $CL.createKernel([
            '#define DIMS ' + dims,
            '#define SRC_TYPE ' + ctypes[val_mat._klass],
            '#define DST_TYPE ' + ctypes[this._klass],
            '#define TYPE_CAST(x) ' + MatrixCL.get_cast_str(this._klass, val_mat._klass),
            '__kernel void kernel_func(__global DST_TYPE *dst, __global const SRC_TYPE *src, __global const int *eachdimidx_combined,',
            '__global const int *eachdimidx_offset, __global const int *eachdimidx_size, __global const int *strides, uint output_length) {',
            '  uint i = get_global_id(0);',
            '  if (i >= output_length) { return; }',
            '  uint remain_i = i;',
            '  int inds[DIMS];',
            '  int output_raw_idx = 0;',
            '  for (int dim = 0; dim < DIMS; dim++) {',
            '    __global const int *eachdimidx_dim = eachdimidx_combined + eachdimidx_offset[dim];',
            '    output_raw_idx += (eachdimidx_dim[remain_i % eachdimidx_size[dim]] - 1) * strides[dim];',
            '    remain_i /= eachdimidx_size[dim];',
            '  }',
            '  dst[output_raw_idx] = TYPE_CAST(src[i]);',
            '}'
          ].join('\n'));
          MatrixCL.kernel_cache[kernel_name] = kernel;
        }

        if (output_length > 0) {
          var eachdimidx_combined_mat = MatrixCL._fromtypedarray(eachdimidx_combined, 'int32');
          var eachdimidx_offset_mat = MatrixCL._fromtypedarray(eachdimidx_offset, 'int32');
          var eachdimidx_size_mat = MatrixCL._fromtypedarray(new Int32Array(output_size), 'int32');
          var strides_mat = MatrixCL._fromtypedarray(eachdimstride, 'int32');
          $CL.executeKernel(kernel, [
            { access: WebCL.MEM_WRITE_ONLY, datum: this },
            { access: WebCL.MEM_READ_ONLY, datum: val_mat },
            { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_combined_mat },
            { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_offset_mat },
            { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_size_mat },
            { access: WebCL.MEM_READ_ONLY, datum: strides_mat },
            { datum: output_length, type: WebCL.type.UINT }
          ], output_length);
          eachdimidx_combined_mat.destruct();
          eachdimidx_offset_mat.destruct();
          strides_mat.destruct();
          if (destruct_val_mat) {
            val_mat.destruct();
          }
        }
      } else {
        //val is scalar
        var kernel_name = 'set_matrix_nd_scalar_' + this._klass + '_' + dims;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
          kernel = $CL.createKernel([
            '#define DIMS ' + dims,
            '#define DST_TYPE ' + ctypes[this._klass],
            '__kernel void kernel_func(__global DST_TYPE *dst, DST_TYPE src, __global const int *eachdimidx_combined,',
            '__global const int *eachdimidx_offset, __global const int *eachdimidx_size, __global const int *strides, uint output_length) {',
            '  uint i = get_global_id(0);',
            '  if (i >= output_length) { return; }',
            '  uint remain_i = i;',
            '  int inds[DIMS];',
            '  int output_raw_idx = 0;',
            '  for (int dim = 0; dim < DIMS; dim++) {',
            '    __global const int *eachdimidx_dim = eachdimidx_combined + eachdimidx_offset[dim];',
            '    output_raw_idx += (eachdimidx_dim[remain_i % eachdimidx_size[dim]] - 1) * strides[dim];',
            '    remain_i /= eachdimidx_size[dim];',
            '  }',
            '  dst[output_raw_idx] = src;',
            '}'
          ].join('\n'));
          MatrixCL.kernel_cache[kernel_name] = kernel;
        }

        if (output_length > 0) {
          var eachdimidx_combined_mat = MatrixCL._fromtypedarray(eachdimidx_combined, 'int32');
          var eachdimidx_offset_mat = MatrixCL._fromtypedarray(eachdimidx_offset, 'int32');
          var eachdimidx_size_mat = MatrixCL._fromtypedarray(new Int32Array(output_size), 'int32');
          var strides_mat = MatrixCL._fromtypedarray(eachdimstride, 'int32');
          var scalar_val = MatrixCL.cast_scalar_val(<number>val, this._klass);
          $CL.executeKernel(kernel, [
            { access: WebCL.MEM_WRITE_ONLY, datum: this },
            { datum: scalar_val, type: webcltypes[this._klass] },
            { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_combined_mat },
            { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_offset_mat },
            { access: WebCL.MEM_READ_ONLY, datum: eachdimidx_size_mat },
            { access: WebCL.MEM_READ_ONLY, datum: strides_mat },
            { datum: output_length, type: WebCL.type.UINT }
          ], output_length);
          eachdimidx_combined_mat.destruct();
          eachdimidx_offset_mat.destruct();
          strides_mat.destruct();
        }
      }

    } finally {

    }
  }

  set_matrix_logical(val: number | Matrix, map: Matrix): void {
    //not paralleled; very slow

    //first, count output size
    var map_cl: MatrixCL;
    var destruct_map_cl = false;
    var val_mat: MatrixCL;
    var destruct_val_mat = false;
    if (map instanceof MatrixCL) {
      map_cl = map;
    } else {
      map_cl = MatrixCL._fromnativemat(map);
      destruct_map_cl = true;
    }

    try {
      var count_mat = new MatrixCL([1, 2], 'int32');
      var kernel_name = 'set_matrix_logical_count';
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        kernel = $CL.createKernel([
          '#define SRC_DST_TYPE ' + ctypes[this._klass],
          '__kernel void kernel_func(__global int *count, __global uchar *logical_index, uint index_length) {',
          '  int ctr = 0;',
          '  int max_i = -1;',
          '  if (get_global_id(0) > 0) {return;}',
          '  for (uint i = 0; i < index_length; i++) {',
          '    uchar val = logical_index[i];',
          '    if (val) {',
          '      ctr++;',
          '      max_i = i;',
          '    }',
          '  }',
          '  count[0] = ctr;',
          '  count[1] = max_i;',
          '}'
        ].join('\n'));
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      var count_array = new Int32Array(2);
      if (map_cl._numel > 0) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: count_mat },
          { access: WebCL.MEM_READ_ONLY, datum: map_cl },
          { datum: map_cl._numel, type: WebCL.type.UINT }
        ], 1);
        count_mat.read(count_array);
      }

      var output_length = count_array[0];
      var max_i = count_array[1];

      //second, read sequentially and write
      if (this._numel <= max_i) {
        throw new Error('Index out of bounds');
      }

      if (val instanceof Matrix) {
        if (val instanceof MatrixCL) {
          val_mat = val;
        } else {
          val_mat = MatrixCL._fromnativemat(val);
          destruct_val_mat = true;
        }

        var kernel_name = 'set_matrix_logical_' + this._klass + '_' + val_mat._klass;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
          kernel = $CL.createKernel([
            '#define SRC_TYPE ' + ctypes[val_mat._klass],
            '#define DST_TYPE ' + ctypes[this._klass],
            '#define TYPE_CAST(x) ' + MatrixCL.get_cast_str(this._klass, val_mat._klass),
            '__kernel void kernel_func(__global DST_TYPE *dst, __global SRC_TYPE *src, __global uchar *logical_index, uint output_length) {',
            '  uint i = get_global_id(0);',
            '  if (i > 0) { return; }',
            '  int out_idx = 0;',
            '  int in_idx = 0;',
            '  while (out_idx < output_length) {',
            '    if (logical_index[in_idx]) {',
            '      dst[in_idx] = TYPE_CAST(src[out_idx++]);',
            '    }',
            '    in_idx++;',
            '  }',
            '}'
          ].join('\n'));
          MatrixCL.kernel_cache[kernel_name] = kernel;
        }

        if (output_length > 0) {
          $CL.executeKernel(kernel, [
            { access: WebCL.MEM_WRITE_ONLY, datum: this },
            { access: WebCL.MEM_READ_ONLY, datum: val_mat },
            { access: WebCL.MEM_READ_ONLY, datum: map_cl },
            { datum: output_length, type: WebCL.type.UINT }
          ], 1);
        }
      } else {

        var kernel_name = 'set_matrix_logical_' + this._klass + '_scalar';
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
          kernel = $CL.createKernel([
            '#define DST_TYPE ' + ctypes[this._klass],
            '__kernel void kernel_func(__global DST_TYPE *dst, DST_TYPE src, __global uchar *logical_index, uint output_length) {',
            '  uint i = get_global_id(0);',
            '  if (i > 0) { return; }',
            '  int out_idx = 0;',
            '  int in_idx = 0;',
            '  while (out_idx < output_length) {',
            '    if (logical_index[in_idx]) {',
            '      dst[in_idx] = src; out_idx++;',
            '    }',
            '    in_idx++;',
            '  }',
            '}'
          ].join('\n'));
          MatrixCL.kernel_cache[kernel_name] = kernel;
        }

        if (output_length > 0) {
          var scalar_val = MatrixCL.cast_scalar_val(<number>val, this._klass);
          $CL.executeKernel(kernel, [
            { access: WebCL.MEM_WRITE_ONLY, datum: this },
            { datum: scalar_val, type: webcltypes[this._klass] },
            { access: WebCL.MEM_READ_ONLY, datum: map_cl },
            { datum: output_length, type: WebCL.type.UINT }
          ], 1);
        }
      }
    } finally {
      count_mat.destruct();
      if (destruct_map_cl) {
        map_cl.destruct();
      }
      if (destruct_val_mat) {
        val_mat.destruct();
      }
    }
  }

  _find(): MatrixCL {
    //not paralleled; very slow

    //first, count output size
    var count_mat = new MatrixCL([1, 2], 'int32');
    var kernel_name = 'matrix_find_count_' + this._klass;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_TYPE ' + ctypes[this._klass],
        '__kernel void kernel_func(__global int *count, __global SRC_TYPE *logical_index, uint numel) {',
        '  int ctr = 0;',
        '  int max_i = -1;',
        '  if (get_global_id(0) > 0) {return;}',
        '  for (uint i = 0; i < numel; i++) {',
        '    SRC_TYPE val = logical_index[i];',
        '    if (val) {',
        '      ctr++;',
        '      max_i = i;',
        '    }',
        '  }',
        '  count[0] = ctr;',
        '  count[1] = max_i;',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    var count_array = new Int32Array(2);//default value 0
    if (this._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: count_mat },
        { access: WebCL.MEM_READ_ONLY, datum: this },
        { datum: this._numel, type: WebCL.type.UINT }
      ], 1);
      count_mat.read(count_array);
    }

    var output_length = count_array[0];
    var max_i = count_array[1];

    //second, write indices
    var output = new MatrixCL([output_length, 1], 'int32');
    var kernel_name = 'matrix_find_write_' + this._klass;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_TYPE ' + ctypes[this._klass],
        '__kernel void kernel_func(__global int *dst, __global SRC_DST_TYPE *src, uint output_length) {',
        '  uint i = get_global_id(0);',
        '  if (i > 0) { return; }',
        '  int out_idx = 0;',
        '  int in_idx = 0;',
        '  while (out_idx < output_length) {',
        '    if (src[in_idx]) {',
        '      dst[out_idx++] = in_idx + 1;',
        '    }',
        '    in_idx++;',
        '  }',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (output_length > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: output },
        { access: WebCL.MEM_READ_ONLY, datum: this },
        { datum: output_length, type: WebCL.type.UINT }
      ], 1);
    }
    if (this._size[1] == this._numel) {
      // row vector
      output.reshape_inplace(this._size);
    }

    count_mat.destruct();

    return output;
  }

}

export = MatrixCL;
