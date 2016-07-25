x = rand(4, 8);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(3,[7 5 2 1 5],2);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
