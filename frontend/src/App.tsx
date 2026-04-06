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
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import PendingProducts from "./pages/Products/PendingProducts";
import ActiveProducts from "./pages/Products/ActiveProducts";
import RejectedProducts from "./pages/Products/RejectedProducts";
import OnHoldProducts from "./pages/Products/OnHoldProducts";
import ClaimedProducts from "./pages/Products/ClaimedProducts";
import Sync from "./pages/Master/Sync";
import ManagePlans from "./pages/Master/ManagePlans/ManagePlans";
import ProductCategoryMaster from "./pages/Master/ProductMaster/ProductCategoryMaster";
import Vendors from "./pages/Vendors/Vendors";


export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Dashboard Layout */}
          <Route element={<AppLayout />}>
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
            <Route path="/vendors" element={<Vendors />} />

            {/* Master */}
            <Route path="master/sync" element={<Sync />} />
            <Route path="master/manage-plans" element={<ManagePlans />} />
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
