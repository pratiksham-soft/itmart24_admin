import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { firestore } from "../config/firebaseAdmin";

/**
 * Run this script to import but make sure to keep category.csv file in import folder
 * npx ts-node src/scripts/importProductCategories.ts
 * example
 * D:\IT MART24\ITMart24 Admin\itmart24_admin\backend>npx ts-node src/scripts/importProductCategories.ts
 * 
 * @param name 
 * @returns 
 */

const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
};

const filePath = path.join(
  __dirname,
  "../../imports/categories.csv"
);

interface CSVRow {
  mainCategory: string;
  subCategory: string;
  subSubCategory: string;
}

const importCategories = async () => {
  const rows: CSVRow[] = [];

  return new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data: CSVRow) => {
        rows.push(data);
      })
      .on("end", async () => {
        try {
          console.log(`📄 Total rows: ${rows.length}`);

          let orderCounter = 1;

          for (const row of rows) {
            const mainName = row.mainCategory.trim();
            const subName = row.subCategory.trim();
            const subSubName = row.subSubCategory.trim();

            // ==========================
            // MAIN CATEGORY
            // ==========================
            let mainDoc = await firestore
              .collection("product_categories")
              .where("slug", "==", generateSlug(mainName))
              .limit(1)
              .get();

            let mainRef;

            if (mainDoc.empty) {
              mainRef = await firestore
                .collection("product_categories")
                .add({
                  name: mainName,
                  slug: generateSlug(mainName),
                  isActive: true,
                  isDeleted: false,
                  order: orderCounter++,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });

              console.log(`✅ Created Main: ${mainName}`);
            } else {
              mainRef = mainDoc.docs[0].ref;
            }

            // ==========================
            // SUB CATEGORY
            // ==========================
            let subDoc = await mainRef
              .collection("subcategories")
              .where("slug", "==", generateSlug(subName))
              .limit(1)
              .get();

            let subRef;

            if (subDoc.empty) {
              subRef = await mainRef
                .collection("subcategories")
                .add({
                  name: subName,
                  slug: generateSlug(subName),
                  isActive: true,
                  isDeleted: false,
                  order: orderCounter++,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });

              console.log(`   ➜ Created Sub: ${subName}`);
            } else {
              subRef = subDoc.docs[0].ref;
            }

            // ==========================
            // SUB SUB CATEGORY
            // ==========================
            let subSubDoc = await subRef
              .collection("subsubcategories")
              .where("slug", "==", generateSlug(subSubName))
              .limit(1)
              .get();

            if (subSubDoc.empty) {
              await subRef
                .collection("subsubcategories")
                .add({
                  name: subSubName,
                  slug: generateSlug(subSubName),
                  isActive: true,
                  isDeleted: false,
                  order: orderCounter++,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });

              console.log(`      ➜ Created SubSub: ${subSubName}`);
            }
          }

          console.log("🎉 Import completed successfully");
          resolve();
        } catch (error) {
          reject(error);
        }
      })
      .on("error", reject);
  });
};

importCategories()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Import failed:", err);
    process.exit(1);
  });