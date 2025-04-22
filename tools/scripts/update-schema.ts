import fs from 'fs';
import path from 'path';

const SCHEMA_FILE_PATH = path.resolve(
  __dirname,
  '../../',
  'prisma/schema.prisma'
);

// *Note: This script does not add relations to the schema. It only adds fields to the models.
// Eg:   healthWorker CommunityHealthWorker @relation(fields: [chwUid], references: [uuid])

// ================DEFINE YOUR SCHEMA UPDATES HERE================
const FIELDS_TO_ADD = [
  {
    model: 'Beneficiary',
    fields: [
      {
        fieldName: 'gender',
        fieldType: 'Gender',
        enumName: 'Gender',
        enumValues: ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'],
        defaultValue: 'UNKNOWN',
      },
      {
        fieldName: 'benTokens',
        fieldType: 'Int',
        defaultValue: 0,
      },
    ],
  },
];

async function updateProjectSchemas(
  payload: Array<{
    model: string;
    fields: Array<{
      fieldName: string;
      fieldType: string;
      enumName?: string;
      enumValues?: string[];
      defaultValue?: string | number | boolean;
      isUuid?: boolean;
      isArray?: boolean;
    }>;
  }>
) {
  try {
    // 1. Read the schema.prisma file
    let schemaContent = fs.readFileSync(SCHEMA_FILE_PATH, 'utf-8');

    for (const { model, fields } of payload) {
      // 2. Define the model pattern dynamically
      const modelPattern = new RegExp(`model ${model} \\{([\\s\\S]*?)\\}`, 'g');
      const existingModel = schemaContent.match(modelPattern);

      if (!existingModel) {
        throw new Error(`${model} model not found in schema.`);
      }

      const modelBody = existingModel[0];

      // 3. Handle enums
      for (const { enumName, enumValues } of fields) {
        if (enumName && enumValues) {
          schemaContent = createEnumDefinition(
            enumName,
            enumValues,
            schemaContent
          );
        }
      }

      // 4. Add fields after the `uuid` field or other specified fields
      const uuidFieldPattern = /\s*uuid\s+\w+\s+.*?@unique.*?@db\.Uuid\(\)/;
      const uuidMatch = modelBody.match(uuidFieldPattern);

      if (!uuidMatch) {
        throw new Error(`UUID field not found in ${model} model.`);
      }

      const insertPosition =
        modelBody.indexOf(uuidMatch[0]) + uuidMatch[0].length;

      const fieldsToInsert = fields
        .map(({ fieldName, fieldType, defaultValue, isUuid, isArray }) => {
          const uuidStr = isUuid ? ' @db.Uuid()' : '';
          const arrayType = isArray ? '[]' : '?';
          const defaultValueStr =
            defaultValue !== undefined ? ` @default(${defaultValue})` : '';
          return `${fieldName}  ${fieldType}${arrayType} ${defaultValueStr}  ${uuidStr}`;
        })
        .join('\n');

      // 5. Insert the new fields into the model
      const updatedModelBody =
        modelBody.slice(0, insertPosition) +
        '\n' +
        fieldsToInsert +
        modelBody.slice(insertPosition);

      // 6. Replace the model in the schema
      schemaContent = schemaContent.replace(existingModel[0], updatedModelBody);
    }

    // 7. Write back the updated schema
    fs.writeFileSync(SCHEMA_FILE_PATH, schemaContent, 'utf-8');
    console.log('===Fields successfully added to specified models===');
  } catch (error) {
    console.error('Error updating schema:', error);
  }
}

function createEnumDefinition(
  enumName: string,
  enumValues: string[],
  schemaContent: string
) {
  const enumPattern = new RegExp(`enum ${enumName}\\s*\\{`, 'g');
  if (!enumPattern.test(schemaContent)) {
    const enumBlock = `\nenum ${enumName} {\n  ${enumValues.join('\n  ')}\n}\n`;
    schemaContent += enumBlock;
  }
  return schemaContent;
}

updateProjectSchemas(FIELDS_TO_ADD);
