x = rand(7, 9);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(3,8);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
