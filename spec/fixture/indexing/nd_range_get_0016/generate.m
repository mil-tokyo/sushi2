x = rand(6, 9, 1);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(end-3:end-3,end-8:0:end-2,1);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
