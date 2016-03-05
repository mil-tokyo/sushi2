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
