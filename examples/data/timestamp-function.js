export default async function(result, path, match, remainingLength) {
  const timestamp = new Date().toISOString();
  const content = "Generated at: " + timestamp;
  return {
    operationResults: result.replace(match, content),
    combinedRemainingCount: remainingLength - content.length,
  };
}