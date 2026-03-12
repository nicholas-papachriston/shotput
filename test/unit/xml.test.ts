import { describe, expect, it } from "bun:test";
import { createXmlParser } from "../../src/support/xml";

describe("xml", () => {
	const parser = createXmlParser();

	describe("parse", () => {
		describe("basic XML parsing", () => {
			it("should parse simple XML with single tag", () => {
				const xml = "<root>content</root>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.text).toBe("content");
				expect(result.children).toEqual([]);
				expect(result.attributes).toEqual({});
			});

			it("should parse XML with nested tags", () => {
				const xml = "<root><child>text</child></root>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.children).toHaveLength(1);
				expect(result.children[0].tag).toBe("child");
				expect(result.children[0].text).toBe("text");
			});

			it("should parse XML with multiple children", () => {
				const xml = "<root><child1>text1</child1><child2>text2</child2></root>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.children).toHaveLength(2);
				expect(result.children[0].tag).toBe("child1");
				expect(result.children[0].text).toBe("text1");
				expect(result.children[1].tag).toBe("child2");
				expect(result.children[1].text).toBe("text2");
			});

			it("should parse deeply nested XML", () => {
				const xml =
					"<root><level1><level2><level3>deep</level3></level2></level1></root>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.children[0].tag).toBe("level1");
				expect(result.children[0].children[0].tag).toBe("level2");
				expect(result.children[0].children[0].children[0].tag).toBe("level3");
				expect(result.children[0].children[0].children[0].text).toBe("deep");
			});

			it("should parse XML with empty tags", () => {
				const xml = "<root><empty></empty></root>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.children).toHaveLength(1);
				expect(result.children[0].tag).toBe("empty");
				expect(result.children[0].text).toBeUndefined();
			});
		});

		describe("attributes", () => {
			it("should parse single attribute with double quotes", () => {
				const xml = '<root id="123">content</root>';
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.attributes).toEqual({ id: "123" });
				expect(result.text).toBe("content");
			});

			it("should parse single attribute with single quotes", () => {
				const xml = "<root id='456'>content</root>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.attributes).toEqual({ id: "456" });
			});

			it("should parse multiple attributes", () => {
				const xml = '<root id="1" name="test" type="demo">content</root>';
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.attributes).toEqual({
					id: "1",
					name: "test",
					type: "demo",
				});
			});

			it("should parse attributes on nested elements", () => {
				const xml = '<root><child attr="value">text</child></root>';
				const result = parser.parse(xml);

				expect(result.children[0].tag).toBe("child");
				expect(result.children[0].attributes).toEqual({ attr: "value" });
				expect(result.children[0].text).toBe("text");
			});

			it("should handle attributes with numeric values", () => {
				const xml = '<root count="42" price="19.99">content</root>';
				const result = parser.parse(xml);

				expect(result.attributes).toEqual({ count: "42", price: "19.99" });
			});
		});

		describe("whitespace handling", () => {
			it("should trim leading and trailing whitespace from text", () => {
				const xml = "<root>  content  </root>";
				const result = parser.parse(xml);

				expect(result.text).toBe("content");
			});

			it("should handle XML with newlines", () => {
				const xml = `
					<root>
						<child>text</child>
					</root>
				`;
				const result = parser.parse(xml);

				expect(result.tag).toBe("root");
				expect(result.children[0].tag).toBe("child");
				expect(result.children[0].text).toBe("text");
			});

			it("should handle tabs and multiple spaces", () => {
				const xml = "<root>\t\t  content\t  </root>";
				const result = parser.parse(xml);

				expect(result.text).toBe("content");
			});

			it("should ignore whitespace-only text nodes", () => {
				const xml = "<root>   <child>text</child>   </root>";
				const result = parser.parse(xml);

				expect(result.text).toBeUndefined();
				expect(result.children).toHaveLength(1);
			});
		});

		describe("complex structures", () => {
			it("should parse XML with mixed content and attributes", () => {
				const xml = `
					<ListBucketResult>
						<Name>my-bucket</Name>
						<Prefix></Prefix>
						<Marker></Marker>
						<MaxKeys>1000</MaxKeys>
						<IsTruncated>false</IsTruncated>
					</ListBucketResult>
				`;
				const result = parser.parse(xml);

				expect(result.tag).toBe("ListBucketResult");
				expect(result.children).toHaveLength(5);
				expect(result.children[0].tag).toBe("Name");
				expect(result.children[0].text).toBe("my-bucket");
			});

			it("should parse S3-like XML structure", () => {
				const xml = `
					<ListBucketResult>
						<Contents>
							<Key>file1.txt</Key>
							<Size>100</Size>
						</Contents>
						<Contents>
							<Key>file2.txt</Key>
							<Size>200</Size>
						</Contents>
					</ListBucketResult>
				`;
				const result = parser.parse(xml);

				expect(result.tag).toBe("ListBucketResult");
				expect(result.children).toHaveLength(2);
				expect(result.children[0].tag).toBe("Contents");
				expect(result.children[0].children[0].tag).toBe("Key");
				expect(result.children[0].children[0].text).toBe("file1.txt");
			});

			it("should handle sibling elements with same tag name", () => {
				const xml = `
					<root>
						<item>first</item>
						<item>second</item>
						<item>third</item>
					</root>
				`;
				const result = parser.parse(xml);

				expect(result.children).toHaveLength(3);
				expect(result.children[0].text).toBe("first");
				expect(result.children[1].text).toBe("second");
				expect(result.children[2].text).toBe("third");
			});
		});

		describe("special characters", () => {
			it("should parse text with special characters", () => {
				const xml = "<root>Hello & goodbye</root>";
				const result = parser.parse(xml);

				expect(result.text).toBe("Hello & goodbye");
			});

			it("should handle hyphens in tag names", () => {
				const xml = "<root-tag>content</root-tag>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root-tag");
				expect(result.text).toBe("content");
			});

			it("should handle underscores in tag names", () => {
				const xml = "<root_tag>content</root_tag>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("root_tag");
				expect(result.text).toBe("content");
			});

			it("should handle numbers in tag names", () => {
				const xml = "<tag123>content</tag123>";
				const result = parser.parse(xml);

				expect(result.tag).toBe("tag123");
				expect(result.text).toBe("content");
			});
		});
	});

	describe("parseS3ListResponse", () => {
		it("should extract single key from S3 XML response", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key>file1.txt</Key>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual(["file1.txt"]);
		});

		it("should extract multiple keys from S3 XML response", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key>file1.txt</Key>
						<Size>100</Size>
					</Contents>
					<Contents>
						<Key>file2.txt</Key>
						<Size>200</Size>
					</Contents>
					<Contents>
						<Key>folder/file3.txt</Key>
						<Size>300</Size>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual(["file1.txt", "file2.txt", "folder/file3.txt"]);
		});

		it("should handle keys with special characters", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key>file-with-dashes.txt</Key>
					</Contents>
					<Contents>
						<Key>file_with_underscores.txt</Key>
					</Contents>
					<Contents>
						<Key>file.with.dots.txt</Key>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual([
				"file-with-dashes.txt",
				"file_with_underscores.txt",
				"file.with.dots.txt",
			]);
		});

		it("should handle keys with paths", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key>folder1/folder2/file.txt</Key>
					</Contents>
					<Contents>
						<Key>a/b/c/d/e.txt</Key>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual(["folder1/folder2/file.txt", "a/b/c/d/e.txt"]);
		});

		it("should handle empty key tags", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key></Key>
					</Contents>
					<Contents>
						<Key>file.txt</Key>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			// Empty keys should be filtered out
			expect(keys).toEqual(["file.txt"]);
		});

		it("should handle response with no keys", () => {
			const xml = `
				<ListBucketResult>
					<Name>my-bucket</Name>
					<Prefix></Prefix>
					<Marker></Marker>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual([]);
		});

		it("should handle large number of keys efficiently", () => {
			const keyElements = Array.from(
				{ length: 1000 },
				(_, i) => `<Key>file${i}.txt</Key>`,
			).join("");
			const xml = `<ListBucketResult>${keyElements}</ListBucketResult>`;

			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toHaveLength(1000);
			expect(keys[0]).toBe("file0.txt");
			expect(keys[999]).toBe("file999.txt");
		});

		it("should handle keys with spaces", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key>file with spaces.txt</Key>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual(["file with spaces.txt"]);
		});

		it("should handle keys with numbers", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key>2024-01-01-report.txt</Key>
					</Contents>
					<Contents>
						<Key>12345.txt</Key>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual(["2024-01-01-report.txt", "12345.txt"]);
		});

		it("should ignore other XML elements", () => {
			const xml = `
				<ListBucketResult>
					<Name>my-bucket</Name>
					<Prefix>folder/</Prefix>
					<Contents>
						<Key>file1.txt</Key>
						<LastModified>2024-01-01T00:00:00Z</LastModified>
						<Size>1024</Size>
						<StorageClass>STANDARD</StorageClass>
					</Contents>
					<Contents>
						<Key>file2.txt</Key>
						<LastModified>2024-01-02T00:00:00Z</LastModified>
						<Size>2048</Size>
					</Contents>
					<IsTruncated>false</IsTruncated>
					<MaxKeys>1000</MaxKeys>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual(["file1.txt", "file2.txt"]);
		});

		it("should handle malformed XML gracefully", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<Key>file1.txt
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			// Should return empty array or partial results
			expect(Array.isArray(keys)).toBe(true);
		});

		it("should be case sensitive for Key tags", () => {
			const xml = `
				<ListBucketResult>
					<Contents>
						<key>lowercase.txt</key>
						<Key>proper.txt</Key>
						<KEY>uppercase.txt</KEY>
					</Contents>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			// Only <Key> tags should be recognized
			expect(keys).toEqual(["proper.txt"]);
		});

		it("should handle consecutive Key tags", () => {
			const xml = `
				<ListBucketResult>
					<Key>file1.txt</Key>
					<Key>file2.txt</Key>
					<Key>file3.txt</Key>
				</ListBucketResult>
			`;
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual(["file1.txt", "file2.txt", "file3.txt"]);
		});
	});

	describe("edge cases", () => {
		it("should handle empty XML string", () => {
			const xml = "";
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual([]);
		});

		it("should handle XML with only whitespace", () => {
			const xml = "   \n\t  ";
			const keys = parser.parseS3ListResponse(xml);

			expect(keys).toEqual([]);
		});

		it("should handle single tag XML for parse", () => {
			const xml = "<root></root>";
			const result = parser.parse(xml);

			expect(result.tag).toBe("root");
			expect(result.children).toEqual([]);
			expect(result.text).toBeUndefined();
		});

		it("should handle XML with CDATA-like content", () => {
			const xml = "<root><![CDATA[some data]]></root>";
			const result = parser.parse(xml);

			// Basic parser doesn't handle CDATA, but should not crash
			expect(result.tag).toBe("root");
		});
	});
});
