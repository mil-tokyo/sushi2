x = rand(6, 8, 5);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(6,end-4:3,[3 5 2 1 4]);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
