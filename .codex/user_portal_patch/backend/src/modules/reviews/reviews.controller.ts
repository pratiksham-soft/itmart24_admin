import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../types/express";
import { sendSuccess } from "../../utils/http";
import {
  publicReviewQuerySchema,
  reviewReportSchema,
  reviewSchema,
  reviewThreadMessageSchema,
  reviewVoteSchema,
} from "./reviews.schemas";
import {
  addReviewThreadMessage,
  getCollectionProductsForHandle,
  createReview,
  deleteReview,
  getCategoryCollectionTaxonomy,
  getReviewById,
  getReviewCatalog,
  getReviewThread,
  listMyReviews,
  listPublicProductReviews,
  markReviewUseful,
  reportReview,
  updateReview,
  voteOnReview,
} from "./reviews.service";

export async function catalog(_req: Request, res: Response) {
  return sendSuccess(res, await getReviewCatalog());
}

export async function taxonomy(_req: Request, res: Response) {
  return sendSuccess(res, await getCategoryCollectionTaxonomy());
}

export async function collectionProducts(req: Request, res: Response) {
  return sendSuccess(res, await getCollectionProductsForHandle(String(req.query.collectionHandle ?? "")));
}

export async function publicProductReviews(req: AuthenticatedRequest, res: Response) {
  const query = publicReviewQuerySchema.parse(req.query);
  return sendSuccess(res, await listPublicProductReviews(query, req.user?.id));
}

export async function list(req: AuthenticatedRequest, res: Response) {
  return sendSuccess(res, await listMyReviews(String(req.user?.id)));
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const payload = reviewSchema.parse(req.body);
  return sendSuccess(res, await createReview(String(req.user?.id), payload), 201);
}

export async function details(req: AuthenticatedRequest, res: Response) {
  return sendSuccess(res, await getReviewById(String(req.user?.id), String(req.params.id)));
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const payload = reviewSchema.parse(req.body);
  return sendSuccess(res, await updateReview(String(req.user?.id), String(req.params.id), payload));
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  return sendSuccess(res, await deleteReview(String(req.user?.id), String(req.params.id)));
}

export async function useful(req: AuthenticatedRequest, res: Response) {
  return sendSuccess(res, await markReviewUseful(String(req.user?.id), String(req.params.id)));
}

export async function vote(req: AuthenticatedRequest, res: Response) {
  const payload = reviewVoteSchema.parse(req.body);
  return sendSuccess(res, await voteOnReview(String(req.user?.id), String(req.params.id), payload.voteType));
}

export async function report(req: AuthenticatedRequest, res: Response) {
  const payload = reviewReportSchema.parse(req.body);
  return sendSuccess(res, await reportReview(String(req.user?.id), String(req.params.id), payload), 201);
}

export async function thread(req: AuthenticatedRequest, res: Response) {
  return sendSuccess(res, await getReviewThread(String(req.user?.id), String(req.params.id)));
}

export async function addThreadMessage(req: AuthenticatedRequest, res: Response) {
  const payload = reviewThreadMessageSchema.parse(req.body);
  return sendSuccess(res, await addReviewThreadMessage(String(req.user?.id), String(req.params.id), payload.message), 201);
}
