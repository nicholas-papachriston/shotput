/**
 * Data Processor Function for Shotput
 * 
 * This function demonstrates advanced data processing capabilities:
 * - Reading and parsing data
 * - Filtering and transforming
 * - Aggregating statistics
 * - Formatting output
 * 
 * Use in templates as:
 * {{TemplateType.Function:./functions/data-processor.js}}
 */

export default async function dataProcessor(
	result,
	path,
	match,
	remainingLength,
) {
	// Simulate reading data from a source
	// In a real scenario, this could:
	// - Read from a database
	// - Call an API
	// - Parse CSV/JSON files
	// - Aggregate log data
	
	const sampleData = {
		users: [
			{ id: 1, name: "Alice", department: "Engineering", active: true, joinDate: "2022-03-15" },
			{ id: 2, name: "Bob", department: "Product", active: true, joinDate: "2021-07-22" },
			{ id: 3, name: "Carol", department: "Design", active: true, joinDate: "2023-01-10" },
			{ id: 4, name: "David", department: "Engineering", active: true, joinDate: "2022-11-03" },
			{ id: 5, name: "Eve", department: "Data", active: true, joinDate: "2023-05-18" },
			{ id: 6, name: "Frank", department: "Engineering", active: false, joinDate: "2020-09-12" },
		],
		metrics: {
			totalRequests: 15234,
			successRate: 98.5,
			avgResponseTime: 145,
			errors: 228,
		}
	};
	
	// Processing: Filter active users
	const activeUsers = sampleData.users.filter(u => u.active);
	
	// Processing: Group by department
	const byDepartment = activeUsers.reduce((acc, user) => {
		if (!acc[user.department]) {
			acc[user.department] = [];
		}
		acc[user.department].push(user);
		return acc;
	}, {});
	
	// Processing: Calculate statistics
	const totalUsers = sampleData.users.length;
	const activeCount = activeUsers.length;
	const departments = Object.keys(byDepartment);
	const engineeringCount = byDepartment.Engineering?.length || 0;
	
	// Processing: Calculate derived metrics
	const errorRate = ((sampleData.metrics.errors / sampleData.metrics.totalRequests) * 100).toFixed(2);
	const successfulRequests = Math.round((sampleData.metrics.totalRequests * sampleData.metrics.successRate) / 100);
	
	// Format the processed data
	const content = `
## Processed Data Summary

### User Statistics
- **Total Users**: ${totalUsers}
- **Active Users**: ${activeCount} (${((activeCount / totalUsers) * 100).toFixed(1)}%)
- **Departments**: ${departments.length}
- **Engineering Team Size**: ${engineeringCount}

### Users by Department

${departments.map(dept => `**${dept}**: ${byDepartment[dept].length} member(s)
${byDepartment[dept].map(u => `  - ${u.name} (joined ${u.joinDate})`).join('\n')}`).join('\n\n')}

### System Metrics
- **Total Requests**: ${sampleData.metrics.totalRequests.toLocaleString()}
- **Successful Requests**: ${successfulRequests.toLocaleString()}
- **Success Rate**: ${sampleData.metrics.successRate}%
- **Error Rate**: ${errorRate}%
- **Average Response Time**: ${sampleData.metrics.avgResponseTime}ms

### Performance Status
${sampleData.metrics.successRate >= 99 ? '✅ Excellent' : sampleData.metrics.successRate >= 95 ? '✔️ Good' : '⚠️ Needs attention'}
${sampleData.metrics.avgResponseTime < 100 ? '✅ Fast' : sampleData.metrics.avgResponseTime < 200 ? '✔️ Acceptable' : '⚠️ Slow'}

---
*Data processed at: ${new Date().toISOString()}*
*Function: data-processor.js*
`;

	// Calculate the new remaining length
	const newRemainingLength = remainingLength - content.length;
	
	// Return the result with the match replaced by our processed content
	return {
		operationResults: result.replace(match, content),
		combinedRemainingCount: newRemainingLength,
	};
}