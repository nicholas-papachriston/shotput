type XmlNode = {
	tag: string;
	attributes: Record<string, string>;
	children: XmlNode[];
	text?: string;
};

type Token = {
	type: "openTag" | "closeTag" | "text" | "attribute";
	value: string;
	name?: string;
};

export const createXmlParser = () => {
	// Tokenize XML string into a stream of tokens
	const tokenize = (xml: string): Token[] => {
		const tokens: Token[] = [];
		let i = 0;

		while (i < xml.length) {
			const char = xml[i];

			if (char === "<") {
				if (xml[i + 1] === "/") {
					// Closing tag
					const end = xml.indexOf(">", i);
					tokens.push({
						type: "closeTag",
						value: xml.slice(i + 2, end),
					});
					i = end + 1;
				} else {
					// Opening tag
					const end = xml.indexOf(">", i);
					const tagContent = xml.slice(i + 1, end);
					const [tagName, ...attrs] = tagContent.split(" ").filter(Boolean);

					tokens.push({
						type: "openTag",
						value: tagName,
					});

					// Parse attributes
					for (const attr of attrs) {
						const [name, value] = attr.split("=");
						if (name && value) {
							tokens.push({
								type: "attribute",
								name,
								value: value.replace(/['"]/g, ""),
							});
						}
					}

					i = end + 1;
				}
			} else if (char.trim()) {
				// Text content
				const end = xml.indexOf("<", i);
				const text = xml.slice(i, end).trim();
				if (text) {
					tokens.push({
						type: "text",
						value: text,
					});
				}
				i = end;
			} else {
				i++;
			}
		}

		return tokens;
	};

	// Parse tokens into XML tree
	const parseTokens = (tokens: Token[]): XmlNode => {
		const root: XmlNode = {
			tag: "",
			attributes: {},
			children: [],
		};

		const stack: XmlNode[] = [root];
		let current = root;
		let attributeTarget: XmlNode | null = null;

		for (const token of tokens) {
			switch (token.type) {
				case "openTag": {
					const newNode: XmlNode = {
						tag: token.value,
						attributes: {},
						children: [],
					};
					current.children.push(newNode);
					stack.push(newNode);
					current = newNode;
					attributeTarget = newNode;
					break;
				}
				case "closeTag": {
					stack.pop();
					current = stack[stack.length - 1];
					attributeTarget = null;
					break;
				}
				case "text": {
					current.text = token.value;
					break;
				}
				case "attribute": {
					if (attributeTarget && token.name) {
						attributeTarget.attributes[token.name] = token.value;
					}
					break;
				}
			}
		}

		return root.children[0];
	};

	const parse = (xmlString: string): XmlNode => {
		const tokens = tokenize(xmlString.trim());
		return parseTokens(tokens);
	};

	// Optimized function for S3 list responses
	const parseS3ListResponse = (xmlString: string): string[] => {
		const keys: string[] = [];
		let isInsideKey = false;
		let currentKey = "";

		for (let i = 0; i < xmlString.length; i++) {
			if (xmlString.slice(i, i + 5) === "<Key>") {
				isInsideKey = true;
				i += 4;
				continue;
			}
			if (xmlString.slice(i, i + 6) === "</Key>") {
				if (currentKey) {
					keys.push(currentKey);
				}
				currentKey = "";
				isInsideKey = false;
				i += 5;
				continue;
			}
			if (isInsideKey) {
				currentKey += xmlString[i];
			}
		}

		return keys;
	};

	return {
		parse,
		parseS3ListResponse,
	};
};
