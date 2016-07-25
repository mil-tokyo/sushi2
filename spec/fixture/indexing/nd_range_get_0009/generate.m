x = rand(9, 6);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([2 7 4 5 4],3:6);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
