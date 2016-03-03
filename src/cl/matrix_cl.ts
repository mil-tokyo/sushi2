import Matrix = require('../matrix');
import Colon = require('../colon');
import $CL = require('./driver');
var WebCL = $CL.WebCL;

var ctypes = {single: 'float', int32: 'int', uint8: 'uchar', logical: 'uchar'};
var webcltypes = {single: WebCL.type.FLOAT, int32: WebCL.type.INT, uint8: WebCL.type.UCHAR, logical: WebCL.type.UCHAR};

declare type AllowedTypedArray = Float32Array | Int32Array | Uint8Array;

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
  
  private throw_if_destructed() {
    if (!this._clbuffer) {
      throw new Error('Attempting use destructed matrix');
    }
  }
  
  write(src_typed_array: any, offset?: number) {
    this.throw_if_destructed();
    if (src_typed_array.length > 0) {
      $CL.writeBuffer(this._clbuffer, src_typed_array, offset);
    }
  }
  
  read(dst_typed_array: any, offset?: number) {
    this.throw_if_destructed();
    if (dst_typed_array.length > 0) {
      $CL.readBuffer(this._clbuffer, dst_typed_array, offset);
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
  
  static _fromtypedarray(src_typed_array: AllowedTypedArray, klass: string): MatrixCL {
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
  
  _getdata(): AllowedTypedArray {
    //get copy of data in TypedArray
    var typed_array = this._data_ctor(this._numel);
    this.read(typed_array);
    return typed_array;
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
    
    $CL.executeKernel(kernel,[
      { access: WebCL.MEM_WRITE_ONLY, datum: clone },
      { access: WebCL.MEM_READ_ONLY, datum: this },
      { datum: this._numel, type: WebCL.type.UINT }
    ], this._numel);
    return clone;
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
      if (args.length > 1) {
        return this.get_matrix_nd(args);
      } else {
        if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
          return this.get_matrix_logical(args[0]);
        } else {
          return this.get_matrix_single(args[0]);
        }
      }
    }
  }

  get_scalar(inds: number[]): number {
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    var dst_typed_array = new this._data_ctor(1);//read only 1 element
    this.read(dst_typed_array, arrayidx * this._data_ctor.BYTES_PER_ELEMENT);
    return dst_typed_array[0];
  }
  
  get_matrix_nd(inds: (number | Colon | Matrix)[]): Matrix {
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
        dimidx = dimind.tojsa(this._size[dim]);
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
      $CL.executeKernel(kernel,[
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
      $CL.executeKernel(kernel,[
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
    var count_mat = new MatrixCL([1,2], 'int32');
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
      $CL.executeKernel(kernel,[
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
      $CL.executeKernel(kernel,[
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
      if (args.length > 1) {
        this.set_matrix_nd(val, args);
      } else {
        if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
          this.set_matrix_logical(val, args[0]);
        } else {
          this.set_matrix_single(val, args[0]);
        }
      }
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
      $CL.executeKernel(kernel,[
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
      $CL.executeKernel(kernel,[
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
        dimidx = dimind.tojsa(this._size[dim]);
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
      $CL.executeKernel(kernel,[
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
      $CL.executeKernel(kernel,[
        { access: WebCL.MEM_WRITE_ONLY, datum: this },
        { datum: scalar_val, type: webcltypes[this._klass]},
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
    var count_mat = new MatrixCL([1,2], 'int32');
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
      $CL.executeKernel(kernel,[
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
      $CL.executeKernel(kernel,[
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
      $CL.executeKernel(kernel,[
        { access: WebCL.MEM_WRITE_ONLY, datum: this },
        { datum: scalar_val, type: webcltypes[this._klass]},
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
}

export = MatrixCL;
