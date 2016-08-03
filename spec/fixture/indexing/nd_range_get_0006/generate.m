x = rand(9, 5);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(end-4:0:end-8,[3 4 2 1 5],1);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
