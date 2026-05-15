import { Router } from "express";
import multer from "multer";
import { requireAdminAuth, type AuthenticatedAdminRequest } from "../middleware/adminAuth.middleware";
import {
  addLeadNote,
  completeTask,
  convertLead,
  createActivity,
  createCompany,
  createContact,
  createDeal,
  createLead,
  createLeadTask,
  createSegment,
  createTask,
  deleteCompany,
  deleteContact,
  deleteDeal,
  deleteLead,
  deleteSegment,
  deleteTask,
  getCompanyById,
  getContactById,
  getCRMDashboard,
  getCRMReports,
  getCRMSettings,
  getDealById,
  getLeadById,
  getLeadCustomPortfolioByLeadId,
  getSegmentById,
  getTaskById,
  importLeadsFromCsv,
  listActivities,
  listCompanies,
  listContacts,
  listDeals,
  listLeads,
  listSegments,
  listTasks,
  previewLeadImport,
  previewSegment,
  updateCompany,
  updateContact,
  updateCRMSettings,
  updateDeal,
  updateDealStage,
  updateLead,
  updateSegment,
  updateTask,
} from "../services/crm.service";
import {
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaignById,
  getCampaignRecipients,
  listCampaigns,
  listLeadEmailRecipients,
  previewCampaign,
  sendCampaign,
  sendTestCampaign,
  updateCampaign,
} from "../services/crmEmailCampaign.service";

const router = Router();

const MAX_LEAD_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

const leadImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_LEAD_IMPORT_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const isCsvFile = /\.csv$/i.test(file.originalname) || ["text/csv", "application/vnd.ms-excel", "text/plain"].includes(file.mimetype);
    if (!isCsvFile) {
      callback(new Error("Only CSV files are allowed."));
      return;
    }
    callback(null, true);
  },
});

router.use(requireAdminAuth);

const getActor = (req: AuthenticatedAdminRequest) => {
  if (!req.adminUser) {
    throw new Error("Authentication is required.");
  }

  return {
    id: req.adminUser.id,
    name: req.adminUser.name,
    email: req.adminUser.email,
  };
};

const toPositiveId = (rawValue: string) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid id.");
  }
  return Math.round(parsed);
};

const sendError = (res: any, error: unknown, fallback: string) => {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const status =
    message.includes("not found")
      ? 404
      : message.includes("required") ||
          message.includes("valid") ||
          message.includes("must") ||
          message.includes("No active email account")
        ? 400
        : 500;

  res.status(status).json({
    success: false,
    message,
  });
};

const runLeadImportUpload = (req: any, res: any) =>
  new Promise<void>((resolve, reject) => {
    leadImportUpload.single("file")(req, res, (error) => {
      if (!error) {
        resolve();
        return;
      }

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        reject(new Error("CSV file must be 5 MB or smaller."));
        return;
      }

      reject(error);
    });
  });

router.get("/dashboard", async (_req, res) => {
  try {
    const data = await getCRMDashboard();
    res.json({ success: true, data });
  } catch (error) {
    console.error("CRM dashboard fetch error:", error);
    sendError(res, error, "Failed to fetch CRM dashboard.");
  }
});

router.get("/leads", async (req, res) => {
  try {
    const data = await listLeads(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    console.error("CRM leads fetch error:", error);
    sendError(res, error, "Failed to fetch leads.");
  }
});

router.post("/leads/import/preview", async (req, res) => {
  try {
    await runLeadImportUpload(req, res);
    const uploadRequest = req as typeof req & { file?: Express.Multer.File };
    if (!uploadRequest.file?.buffer) {
      throw new Error("CSV file is required.");
    }

    const data = await previewLeadImport(uploadRequest.file.buffer, req.body ?? {}, getActor(req));
    res.json({ success: true, data });
  } catch (error) {
    console.error("CRM lead import preview error:", error);
    sendError(res, error, "Failed to preview lead import.");
  }
});

router.post("/leads/import", async (req, res) => {
  try {
    await runLeadImportUpload(req, res);
    const uploadRequest = req as typeof req & { file?: Express.Multer.File };
    if (!uploadRequest.file?.buffer) {
      throw new Error("CSV file is required.");
    }

    const data = await importLeadsFromCsv(uploadRequest.file.buffer, req.body ?? {}, getActor(req));
    res.json({
      success: true,
      data,
      message: "Leads imported successfully",
    });
  } catch (error) {
    console.error("CRM lead import error:", error);
    sendError(res, error, "Failed to import leads.");
  }
});

router.get("/leads/email-recipients", async (req, res) => {
  try {
    const data = await listLeadEmailRecipients(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch lead email recipients.");
  }
});

router.get("/leads/:id", async (req, res) => {
  try {
    const lead = await getLeadById(toPositiveId(req.params.id));
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead not found." });
      return;
    }
    res.json({ success: true, item: lead });
  } catch (error) {
    sendError(res, error, "Failed to fetch lead.");
  }
});

router.get("/leads/:id/custom-portfolio", async (req, res) => {
  try {
    const item = await getLeadCustomPortfolioByLeadId(toPositiveId(req.params.id));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to fetch custom portfolio details.");
  }
});

router.post("/leads", async (req, res) => {
  try {
    const lead = await createLead(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item: lead });
  } catch (error) {
    console.error("CRM lead create error:", error);
    sendError(res, error, "Failed to create lead.");
  }
});

router.put("/leads/:id", async (req, res) => {
  try {
    const lead = await updateLead(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item: lead });
  } catch (error) {
    console.error("CRM lead update error:", error);
    sendError(res, error, "Failed to update lead.");
  }
});

router.delete("/leads/:id", async (req, res) => {
  try {
    await deleteLead(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true });
  } catch (error) {
    console.error("CRM lead delete error:", error);
    sendError(res, error, "Failed to delete lead.");
  }
});

router.post("/leads/:id/convert", async (req, res) => {
  try {
    const result = await convertLead(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("CRM lead convert error:", error);
    sendError(res, error, "Failed to convert lead.");
  }
});

router.post("/leads/:id/notes", async (req, res) => {
  try {
    const lead = await addLeadNote(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item: lead });
  } catch (error) {
    sendError(res, error, "Failed to add note.");
  }
});

router.post("/leads/:id/tasks", async (req, res) => {
  try {
    const task = await createLeadTask(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item: task });
  } catch (error) {
    sendError(res, error, "Failed to create task.");
  }
});

router.get("/contacts", async (req, res) => {
  try {
    const data = await listContacts(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch contacts.");
  }
});

router.get("/contacts/:id", async (req, res) => {
  try {
    const item = await getContactById(toPositiveId(req.params.id));
    if (!item) {
      res.status(404).json({ success: false, message: "Contact not found." });
      return;
    }
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to fetch contact.");
  }
});

router.post("/contacts", async (req, res) => {
  try {
    const item = await createContact(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to create contact.");
  }
});

router.put("/contacts/:id", async (req, res) => {
  try {
    const item = await updateContact(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to update contact.");
  }
});

router.delete("/contacts/:id", async (req, res) => {
  try {
    await deleteContact(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Failed to delete contact.");
  }
});

router.get("/companies", async (req, res) => {
  try {
    const data = await listCompanies(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch companies.");
  }
});

router.get("/companies/:id", async (req, res) => {
  try {
    const item = await getCompanyById(toPositiveId(req.params.id));
    if (!item) {
      res.status(404).json({ success: false, message: "Company not found." });
      return;
    }
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to fetch company.");
  }
});

router.post("/companies", async (req, res) => {
  try {
    const item = await createCompany(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to create company.");
  }
});

router.put("/companies/:id", async (req, res) => {
  try {
    const item = await updateCompany(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to update company.");
  }
});

router.delete("/companies/:id", async (req, res) => {
  try {
    await deleteCompany(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Failed to delete company.");
  }
});

router.get("/deals", async (req, res) => {
  try {
    const data = await listDeals(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch deals.");
  }
});

router.get("/deals/:id", async (req, res) => {
  try {
    const item = await getDealById(toPositiveId(req.params.id));
    if (!item) {
      res.status(404).json({ success: false, message: "Deal not found." });
      return;
    }
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to fetch deal.");
  }
});

router.post("/deals", async (req, res) => {
  try {
    const item = await createDeal(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to create deal.");
  }
});

router.put("/deals/:id", async (req, res) => {
  try {
    const item = await updateDeal(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to update deal.");
  }
});

router.delete("/deals/:id", async (req, res) => {
  try {
    await deleteDeal(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Failed to delete deal.");
  }
});

router.patch("/deals/:id/stage", async (req, res) => {
  try {
    const item = await updateDealStage(toPositiveId(req.params.id), req.body?.stage, getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to update deal stage.");
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const data = await listTasks(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch tasks.");
  }
});

router.get("/tasks/:id", async (req, res) => {
  try {
    const item = await getTaskById(toPositiveId(req.params.id));
    if (!item) {
      res.status(404).json({ success: false, message: "Task not found." });
      return;
    }
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to fetch task.");
  }
});

router.post("/tasks", async (req, res) => {
  try {
    const item = await createTask(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to create task.");
  }
});

router.put("/tasks/:id", async (req, res) => {
  try {
    const item = await updateTask(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to update task.");
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    await deleteTask(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Failed to delete task.");
  }
});

router.patch("/tasks/:id/complete", async (req, res) => {
  try {
    const item = await completeTask(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to complete task.");
  }
});

router.get("/activities", async (req, res) => {
  try {
    const data = await listActivities(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch activities.");
  }
});

router.post("/activities", async (req, res) => {
  try {
    const item = await createActivity(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to create activity.");
  }
});

router.get("/campaigns", async (req, res) => {
  try {
    const data = await listCampaigns(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch campaigns.");
  }
});

router.get("/campaigns/:id", async (req, res) => {
  try {
    const item = await getCampaignById(toPositiveId(req.params.id));
    if (!item) {
      res.status(404).json({ success: false, message: "Campaign not found." });
      return;
    }
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to fetch campaign.");
  }
});

router.post("/campaigns", async (req, res) => {
  try {
    const item = await createCampaign(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to create campaign.");
  }
});

router.put("/campaigns/:id", async (req, res) => {
  try {
    const item = await updateCampaign(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to update campaign.");
  }
});

router.delete("/campaigns/:id", async (req, res) => {
  try {
    await deleteCampaign(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Failed to delete campaign.");
  }
});

router.post("/campaigns/:id/preview", async (req, res) => {
  try {
    const preview = await previewCampaign(toPositiveId(req.params.id), req.body ?? {});
    res.json({ success: true, preview });
  } catch (error) {
    sendError(res, error, "Failed to preview campaign.");
  }
});

router.post("/campaigns/:id/test-send", async (req, res) => {
  try {
    const result = await sendTestCampaign(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json(result);
  } catch (error) {
    sendError(res, error, "Failed to send test campaign.");
  }
});

router.post("/campaigns/:id/send", async (req, res) => {
  try {
    const item = await sendCampaign(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to send campaign.");
  }
});

router.post("/campaigns/:id/cancel", async (req, res) => {
  try {
    const item = await cancelCampaign(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to cancel campaign.");
  }
});

router.post("/campaigns/:id/duplicate", async (req, res) => {
  try {
    const item = await duplicateCampaign(toPositiveId(req.params.id), getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to duplicate campaign.");
  }
});

router.get("/campaigns/:id/recipients", async (req, res) => {
  try {
    const data = await getCampaignRecipients(toPositiveId(req.params.id), req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch campaign recipients.");
  }
});

router.get("/segments", async (req, res) => {
  try {
    const data = await listSegments(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to fetch segments.");
  }
});

router.get("/segments/:id", async (req, res) => {
  try {
    const item = await getSegmentById(toPositiveId(req.params.id));
    if (!item) {
      res.status(404).json({ success: false, message: "Segment not found." });
      return;
    }
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to fetch segment.");
  }
});

router.post("/segments", async (req, res) => {
  try {
    const item = await createSegment(req.body ?? {}, getActor(req));
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to create segment.");
  }
});

router.put("/segments/:id", async (req, res) => {
  try {
    const item = await updateSegment(toPositiveId(req.params.id), req.body ?? {}, getActor(req));
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, "Failed to update segment.");
  }
});

router.delete("/segments/:id", async (req, res) => {
  try {
    await deleteSegment(toPositiveId(req.params.id), getActor(req));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Failed to delete segment.");
  }
});

router.post("/segments/:id/preview", async (req, res) => {
  try {
    const preview = await previewSegment(toPositiveId(req.params.id));
    res.json({ success: true, preview });
  } catch (error) {
    sendError(res, error, "Failed to preview segment.");
  }
});

router.get("/reports", async (req, res) => {
  try {
    const data = await getCRMReports(req.query);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error, "Failed to fetch CRM reports.");
  }
});

router.get("/settings", async (_req, res) => {
  try {
    const data = await getCRMSettings();
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error, "Failed to fetch CRM settings.");
  }
});

router.put("/settings", async (req, res) => {
  try {
    const data = await updateCRMSettings(req.body ?? {}, getActor(req));
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error, "Failed to update CRM settings.");
  }
});

export default router;
