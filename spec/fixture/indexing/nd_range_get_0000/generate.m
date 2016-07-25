x = rand(6, 7);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([1 4 2 2 1],[1 2 4 5 4]);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
