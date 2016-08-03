x = rand(6, 6);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([2 4 1 5 6],[2 1 3 4 5]);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
