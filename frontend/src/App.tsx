import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import Videos from "./pages/UiElements/Videos";
import Images from "./pages/UiElements/Images";
import Alerts from "./pages/UiElements/Alerts";
import Badges from "./pages/UiElements/Badges";
import Avatars from "./pages/UiElements/Avatars";
import Buttons from "./pages/UiElements/Buttons";
import LineChart from "./pages/Charts/LineChart";
import BarChart from "./pages/Charts/BarChart";
import Calendar from "./pages/Calendar";
import BasicTables from "./pages/Tables/BasicTables";
import FormElements from "./pages/Forms/FormElements";
import Blank from "./pages/Blank";
import AppLayout from "./layout/AppLayout";
import AuthGuard from "./auth/AuthGuard";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import PendingProducts from "./pages/Products/PendingProducts";
import ActiveProducts from "./pages/Products/ActiveProducts";
import RejectedProducts from "./pages/Products/RejectedProducts";
import OnHoldProducts from "./pages/Products/OnHoldProducts";
import ClaimedProducts from "./pages/Products/ClaimedProducts";
import DeleteProducts from "./pages/Products/DeleteProducts";
import Sync from "./pages/Master/Sync";
import ManagePlans from "./pages/Master/ManagePlans/ManagePlans";
import ProductCategoryMaster from "./pages/Master/ProductMaster/ProductCategoryMaster";
import MonthlyTargetMaster from "./pages/Master/MonthlyTarget/MonthlyTargetMaster";
import Vendors from "./pages/Vendors/Vendors";
import ShopifyProducts from "./pages/Shopify/ShopifyProducts";
import ShopifyCollections from "./pages/Shopify/ShopifyCollections";
import Support from "./pages/Support/Support";
import Notifications from "./pages/Notifications/Notifications";
import BlogJobs from "./pages/Marketing/BlogManager/BlogJobs";
import Blogs from "./pages/Marketing/BlogManager/Blogs";
import SmManager from "./pages/Marketing/SmManager";
import Settings from "./pages/Marketing/Settings";
import EmailManager from "./pages/Marketing/EmailManager";
import CRMDashboard from "./pages/Marketing/CRM";
import LeadsPage from "./pages/Marketing/CRM/LeadsPage";
import ContactsPage from "./pages/Marketing/CRM/ContactsPage";
import CompaniesPage from "./pages/Marketing/CRM/CompaniesPage";
import DealsPage from "./pages/Marketing/CRM/DealsPage";
import TasksPage from "./pages/Marketing/CRM/TasksPage";
import ActivitiesPage from "./pages/Marketing/CRM/ActivitiesPage";
import EmailCampaignsPage from "./pages/Marketing/CRM/EmailCampaignsPage";
import SegmentsPage from "./pages/Marketing/CRM/SegmentsPage";
import ReportsPage from "./pages/Marketing/CRM/ReportsPage";
import CRMSettingsPage from "./pages/Marketing/CRM/CRMSettingsPage";
import Users from "./pages/Users/Users";
import UserSettings from "./pages/Users/UserSettings";


export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Dashboard Layout */}
          <Route
            element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }
          >
            <Route index path="/" element={<Home />} />

            {/* Others Page */}
            <Route path="/profile" element={<UserProfiles />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/blank" element={<Blank />} />

            {/* Forms */}
            <Route path="/form-elements" element={<FormElements />} />

            {/* Tables */}
            <Route path="/basic-tables" element={<BasicTables />} />

            {/* Products */}
            <Route path="/products/pending" element={<PendingProducts />} />
            <Route path="/products/active" element={<ActiveProducts />} />
            <Route path="/products/rejected" element={<RejectedProducts />} />
            <Route path="/products/on-hold" element={<OnHoldProducts />} />
            <Route path="/products/claimed" element={<ClaimedProducts />} />
            <Route path="/products/delete" element={<DeleteProducts />} />
            <Route path="/support" element={<Support />} />
            <Route
              path="/notifications"
              element={<Notifications />}
            />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/marketing/blog-manager/jobs" element={<BlogJobs />} />
            <Route path="/marketing/blog-manager/blogs" element={<Blogs />} />
            <Route path="/marketing/sm-manager" element={<SmManager />} />
            <Route path="/marketing/email-manager" element={<EmailManager />} />
            <Route path="/marketing/crm" element={<CRMDashboard />} />
            <Route path="/marketing/crm/leads" element={<LeadsPage />} />
            <Route path="/marketing/crm/contacts" element={<ContactsPage />} />
            <Route path="/marketing/crm/companies" element={<CompaniesPage />} />
            <Route path="/marketing/crm/deals" element={<DealsPage />} />
            <Route path="/marketing/crm/tasks" element={<TasksPage />} />
            <Route path="/marketing/crm/activities" element={<ActivitiesPage />} />
            <Route path="/marketing/crm/email-campaigns" element={<EmailCampaignsPage />} />
            <Route path="/marketing/crm/segments" element={<SegmentsPage />} />
            <Route path="/marketing/crm/reports" element={<ReportsPage />} />
            <Route path="/marketing/crm/settings" element={<CRMSettingsPage />} />
            <Route path="/marketing/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/users/settings" element={<UserSettings />} />

            {/* Shopify */}
            <Route path="/shopify/products" element={<ShopifyProducts />} />
            <Route
              path="/shopify/collections"
              element={<ShopifyCollections />}
            />

            {/* Master */}
            <Route path="master/sync" element={<Sync />} />
            <Route path="master/manage-plans" element={<ManagePlans />} />
            <Route
              path="/master/monthly-target"
              element={<MonthlyTargetMaster />}
            />
            <Route path="/master/product-category-master" element={<ProductCategoryMaster />}
/>

            {/* Ui Elements */}
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/avatars" element={<Avatars />} />
            <Route path="/badge" element={<Badges />} />
            <Route path="/buttons" element={<Buttons />} />
            <Route path="/images" element={<Images />} />
            <Route path="/videos" element={<Videos />} />

            {/* Charts */}
            <Route path="/line-chart" element={<LineChart />} />
            <Route path="/bar-chart" element={<BarChart />} />
          </Route>

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
