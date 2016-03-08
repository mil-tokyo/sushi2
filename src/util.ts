import Matrix = require('./matrix');
declare type MatrixOrNumber = Matrix | number;

//finds common output class for matrices
export function commonklassstr(...klasses: string[]): string {
  // single > int32 > uint8 > logical
  var klass_order = ['single','int32','uint8','logical'];
  if (klasses.length == 0) {
    return klass_order[0];
  }
  var best_klass = 3;
  for (var i = 0; i < klasses.length; i++) {
    var element = klasses[i];
    var score = klass_order.indexOf(element);
    if (score < 0) {
      throw new Error('Unknown klass');
    }
    best_klass = Math.min(score, best_klass);
  }
  
  return klass_order[best_klass];
}

export function commonklass(...mats: MatrixOrNumber[]): string {
  //number not affects class decision
  var klasses: string[] = [];
  for (var i = 0; i < mats.length; i++) {
    var element = mats[i];
    if (element instanceof Matrix) {
      klasses.push(element._klass);
    }
  }
  
  return commonklassstr(...klasses);
}

export function issamesize(sizea: number[], sizeb: number[]): boolean {
  for (var i = 0; i < sizea.length; i++) {
    if (sizea[i] != sizeb[i]) {
      return false;
    }
  }
  
  return true;
}

export function force_cpu(A: MatrixOrNumber): MatrixOrNumber {
  if (A instanceof Matrix) {
    return A.to_cpu();
  } else {
    return A;
  }
}

export function force_cpu_scalar(A: MatrixOrNumber): MatrixOrNumber {
  if (A instanceof Matrix) {
    if (A._numel == 1) {
      return A.get();
    } else {
      return A.to_cpu();
    }
  } else {
    return A;
  }
}

export function jsaequal(a: any[], b: any[]): boolean {
  if (a.length != b.length) {
    return false;
  }

  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) {
      return false;
    }
  }
  return true;
}

export function calc_zeros_size(args: any[]): {size: number[], klass:string} {
  var size: number[];
  var klass = 'single';
  if (args.length >= 1 && typeof (args[args.length - 1]) === 'string') {
    //zeros(_,typename)
    klass = args[args.length - 1];
    args.pop();
  } else if (args.length >= 2 && args[args.length - 2] == 'like') {
    //zeros('like', mat)
    klass = args[args.length - 1]._klass;
    args.pop();
    args.pop();
  }
  if (args.length == 0) {
    // return 1x1 matrix
    size = [1,1];
  } else {
    if (args.length == 1) {
      if (typeof (args[0]) === 'number') {
        // nxn matrix
        size = [args[0], args[0]];
      } else if (args[0] instanceof Matrix) {
        // size given as matrix
        var sizemat: Matrix = args[0];
        if (sizemat._size.length == 2 && sizemat._size[0] == 1 && sizemat._size[1] >= 1) {
          size = Array.prototype.slice.call(sizemat._getdata());
        } else {
          throw new Error('matrix size is not valid row vector');
        }
      } else {
        throw new Error('Unknown data type of argument 0');
      }
    } else {
      size = args;
    }
  }
  
  return {size:size, klass:klass};
}
