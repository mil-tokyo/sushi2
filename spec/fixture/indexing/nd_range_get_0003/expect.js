if (indexing_error.get() > 0) {expect(() => x.get($M.jsa2mat([4, 1, 1, 4, 5], false, 'int32'),$M.jsa2mat([3, 3, 1, 3, 3], false, 'int32'))).toThrow();} else {var t = x.get($M.jsa2mat([4, 1, 1, 4, 5], false, 'int32'),$M.jsa2mat([3, 3, 1, 3, 3], false, 'int32')); if (typeof(t) === 'number') {t = $M.jsa2mat([[t]]);}; expect($M.isequal(t, y)).toBeTruthy();}