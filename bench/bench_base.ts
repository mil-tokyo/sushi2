import $M = require('../src/sushi');

class BenchBase {
  name: string;
  setup(): any[] {
    return [];
  }

  run(...args: any[]): void {
    throw Error('Not implemented');
  }
}

export = BenchBase;
