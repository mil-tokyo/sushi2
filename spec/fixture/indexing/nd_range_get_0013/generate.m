x = rand(3, 3, 9);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([1 2 2 1 1],end-3:11:27);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
